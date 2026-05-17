import axios from "axios";
import { load } from "cheerio";
import type { AxiosResponse } from "axios";
import type { Lead, KategoriKebutuhan } from "../../config/claude.js";
import { sleep } from "../../config/claude.js";

// ─── Konfigurasi ──────────────────────────────────────────────────────────────

const BASE_URL   = "https://rapid.kai.id";
const PORTAL_URL = `${BASE_URL}/kai/portal.promise`;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DELAY_MS = 1500;

// ─── Filter IT ────────────────────────────────────────────────────────────────

const IT_KEYWORDS = [
  "sistem informasi", "aplikasi", "software", "jaringan", "network",
  "komputer", "server", "hardware", "teknologi informasi", "tik",
  "telekomunikasi", "fiber", "wifi", "internet", "bandwidth",
  "cctv", "kamera", "surveillance", "scada",
  "data center", "datacenter", "cloud", "hosting",
  "dashboard", "portal", "website", "digitalisasi",
  "perangkat keras", "perangkat lunak", "integrasi sistem",
  "pengembangan sistem", "it infrastructure",
];

function isITRelevant(text: string): boolean {
  const t = text.toLowerCase();
  return IT_KEYWORDS.some((kw) => t.includes(kw));
}

// ─── Cookie Jar ───────────────────────────────────────────────────────────────

function parseCookieHeaders(headers: string[]): Map<string, string> {
  const jar = new Map<string, string>();
  for (const h of headers) {
    const pair = h.split(";")[0] ?? "";
    const eq   = pair.indexOf("=");
    if (eq < 1) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return jar;
}

function cookiesToString(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function absorbResponse(jar: Map<string, string>, res: AxiosResponse): void {
  const raw = res.headers["set-cookie"];
  if (!raw) return;
  for (const [k, v] of parseCookieHeaders(Array.isArray(raw) ? raw : [raw])) {
    jar.set(k, v);
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

interface KaiSession {
  cookie: string;
  jar:    Map<string, string>;
}

function sessionFromEnv(): KaiSession | null {
  const raw = process.env["KAI_RAPID_SESSION"]?.trim();
  if (!raw) return null;

  console.log("[KAI Agent] Menggunakan session cookie dari KAI_RAPID_SESSION");
  const jar = new Map([["JSESSIONID", raw]]);
  return { cookie: `JSESSIONID=${raw}`, jar };
}

async function loginWithCredentials(): Promise<KaiSession | null> {
  const userId   = process.env["KAI_RAPID_USERNAME"]?.trim();
  const password = process.env["KAI_RAPID_PASSWORD"]?.trim();
  if (!userId || !password) return null;

  console.log("[KAI Agent] Mencoba login dengan username/password...");

  const jar = new Map<string, string>();

  try {
    // 1. GET portal → ambil JSESSIONID + form fields
    const portalRes = await axios.get<string>(PORTAL_URL, {
      timeout: 20_000,
      headers: { "User-Agent": UA, Accept: "text/html" },
      maxRedirects: 5,
    });
    absorbResponse(jar, portalRes);

    const $ = load(portalRes.data);

    // Cari hidden inputs di form login
    const formAction = $("form[action*='login']").attr("action") ??
                       "/kai/loginAction.promise";
    const userField  = $('input[name*="user" i], input[name*="id" i]').first().attr("name") ?? "userId";
    const passField  = $('input[type="password"]').first().attr("name") ?? "password";

    const loginUrl = formAction.startsWith("http")
      ? formAction
      : `${BASE_URL}${formAction.startsWith("/") ? "" : "/"}${formAction}`;

    const body = new URLSearchParams();
    body.append(userField, userId);
    body.append(passField, password);
    // captcha dikosongkan — kemungkinan gagal, tapi dicoba dulu
    body.append("kaptcha", "");
    body.append("captchaResponse", "");

    const loginRes = await axios.post(loginUrl, body, {
      timeout: 20_000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie":       cookiesToString(jar),
        "User-Agent":   UA,
        "Referer":      PORTAL_URL,
        "Origin":       BASE_URL,
      },
      maxRedirects: 0,
      validateStatus: (s) => s < 500,
    });
    absorbResponse(jar, loginRes);

    const location = loginRes.headers["location"] as string ?? "";
    const isBackToLogin =
      location.toLowerCase().includes("login") ||
      (loginRes.status === 200 &&
        (loginRes.data as string).toLowerCase().includes("kaptcha"));

    if (isBackToLogin) {
      console.warn(
        "[KAI Agent] Login otomatis gagal — portal membutuhkan CAPTCHA manual.\n" +
        "  Solusi: Login di browser rapid.kai.id → DevTools (F12) →\n" +
        "  Application → Cookies → salin nilai JSESSIONID →\n" +
        "  set KAI_RAPID_SESSION=<nilai> di .env"
      );
      return null;
    }

    console.log("[KAI Agent] Login berhasil dengan username/password");
    const cookieStr = cookiesToString(jar);
    return { cookie: cookieStr, jar };

  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
      console.warn(`[KAI Agent] DNS/koneksi gagal ke rapid.kai.id: ${msg}`);
    } else {
      console.warn(`[KAI Agent] Error login: ${msg}`);
    }
    return null;
  }
}

// ─── Fetch Tender Data ────────────────────────────────────────────────────────

interface KaiTender {
  id:       string;
  judul:    string;
  satker:   string;
  nilai:    number;
  deadline: string;
  url:      string;
  deskripsi: string;
}

// Promise platform — AJAX endpoint conventions
const AJAX_CANDIDATES = [
  "/kai/getPengumumanPublik.promise",
  "/kai/pengumuman/listAjax.promise",
  "/kai/getPublicLelang.promise",
  "/kai/listPengumuman.promise",
  "/kai/ajaxPengumuman.promise",
];

async function fetchViaDataTables(session: KaiSession): Promise<KaiTender[]> {
  const headers = {
    "Cookie":     session.cookie,
    "User-Agent": UA,
    "Referer":    PORTAL_URL,
    "Accept":     "application/json, text/javascript, */*",
    "X-Requested-With": "XMLHttpRequest",
  };

  const dtParams = new URLSearchParams({
    "draw":                  "1",
    "start":                 "0",
    "length":                "50",
    "search[value]":         "",
    "search[regex]":         "false",
    "order[0][column]":      "0",
    "order[0][dir]":         "desc",
  });

  for (const path of AJAX_CANDIDATES) {
    try {
      await sleep(500);
      const res = await axios.post<unknown>(`${BASE_URL}${path}`, dtParams, {
        timeout: 15_000,
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        validateStatus: (s) => s < 500,
      });

      if (res.status === 404 || res.status === 403) continue;

      const body = res.data;
      if (!body || typeof body !== "object") continue;

      // DataTables response: { data: [[...],[...]] } atau { data: [{...}] }
      const raw = (body as Record<string, unknown>)["data"] as unknown[];
      if (!Array.isArray(raw) || raw.length === 0) continue;

      console.log(`[KAI Agent] DataTables hit: ${path} → ${raw.length} record`);

      return raw.flatMap((row): KaiTender[] => {
        let id = "", judul = "", satker = "", nilai = 0;

        if (Array.isArray(row)) {
          // Positional array: [id, nama, satker, status_html, hps]
          id     = String(row[0] ?? "");
          judul  = String(row[1] ?? "").replace(/<[^>]+>/g, "").trim();
          satker = String(row[2] ?? "").replace(/<[^>]+>/g, "").trim();
          nilai  = parseInt(String(row[4] ?? "0").replace(/[^\d]/g, ""), 10) || 0;
        } else if (typeof row === "object" && row !== null) {
          const r = row as Record<string, unknown>;
          id     = String(r["id"] ?? r["kode"] ?? r["noPaket"] ?? "");
          judul  = String(r["nama"] ?? r["namaPaket"] ?? r["judul"] ?? "");
          satker = String(r["satker"] ?? r["instansi"] ?? r["namaSatker"] ?? "PT KAI");
          nilai  = parseInt(String(r["hps"] ?? r["nilai"] ?? r["pagu"] ?? "0").replace(/[^\d]/g, ""), 10) || 0;
        }

        if (!judul || !isITRelevant(judul)) return [];

        return [{
          id,
          judul,
          satker:   satker || "PT KAI (Persero)",
          nilai,
          deadline: "",
          url:      id ? `${BASE_URL}/kai/detailPengumuman.promise?id=${id}` : PORTAL_URL,
          deskripsi: judul,
        }];
      });

    } catch { /* coba endpoint berikutnya */ }
  }

  return [];
}

async function fetchViaHtmlParse(session: KaiSession): Promise<KaiTender[]> {
  try {
    const res = await axios.get<string>(PORTAL_URL, {
      timeout: 20_000,
      headers: {
        "Cookie":     session.cookie,
        "User-Agent": UA,
        "Accept":     "text/html",
      },
      maxRedirects: 3,
    });

    const html = res.data;
    // Kalau diarahkan kembali ke halaman login, session tidak valid
    if (/kaptcha|loginAction/i.test(html)) {
      console.warn("[KAI Agent] Session tidak valid atau sudah expired");
      return [];
    }

    const $       = load(html);
    const results: KaiTender[] = [];

    // Coba ambil dari tabel #lelangTable atau baris apapun
    $("#lelangTable tr, #pengadaanManual tr, table tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;

      const judul = cells.eq(1).text().trim() ||
                    cells.eq(0).find("a").text().trim();

      if (!judul || !isITRelevant(judul)) return;

      const href  = cells.eq(1).find("a").attr("href") ?? cells.find("a").first().attr("href") ?? "";
      const url   = href.startsWith("http") ? href : href ? `${BASE_URL}${href}` : PORTAL_URL;
      const nilai = parseInt(cells.eq(4).text().replace(/[^\d]/g, ""), 10) || 0;

      results.push({
        id:       url,
        judul,
        satker:   cells.eq(2).text().trim() || "PT KAI (Persero)",
        nilai,
        deadline: cells.eq(3)?.text().trim() || "",
        url,
        deskripsi: judul,
      });
    });

    if (results.length > 0) {
      console.log(`[KAI Agent] HTML parse: ${results.length} tender IT ditemukan`);
    } else {
      console.warn(
        "[KAI Agent] Tidak ada data di tabel — tabel mungkin diisi via AJAX.\n" +
        "  Coba refresh session atau periksa AJAX endpoint secara manual."
      );
    }

    return results;
  } catch (err) {
    console.warn(`[KAI Agent] HTML parse gagal: ${(err as Error).message}`);
    return [];
  }
}

// ─── Mapper → Lead ────────────────────────────────────────────────────────────

function guessKebutuhan(title: string): KategoriKebutuhan {
  const t = title.toLowerCase();
  if (/jaringan|network|wifi|fiber|internet|telekomunikasi/.test(t)) return "jaringan";
  if (/server|hardware|komputer|laptop|datacenter/.test(t))          return "it-infrastructure";
  if (/cctv|kamera|surveillance/.test(t))                            return "cctv";
  if (/scada|iot|integrasi|middleware/.test(t))                      return "sistem-integrasi";
  if (/cloud|hosting|vps/.test(t))                                   return "cloud";
  return "software";
}

function toLog(t: KaiTender): Lead {
  return {
    id:              `kai-${t.id || Date.now()}`,
    sumber:          "CIVD", // BUMN — pakai CIVD sebagai kategori sumber
    url:             t.url,
    namaProyek:      t.judul,
    namaPerusahaan:  t.satker || "PT KAI (Persero)",
    industri:        "BUMN",
    lokasi:          "Indonesia (Nasional)",
    nilaiProyek:     t.nilai,
    deadline:        t.deadline,
    kebutuhan:       guessKebutuhan(t.judul),
    deskripsiKebutuhan: t.deskripsi,
    pic: {
      nama:    "",
      jabatan: "Panitia Pengadaan KAI",
      email:   "",
      telepon: "",
    },
    score:            0,
    prioritas:        "rendah",
    alasanScore:      "",
    tanggalDitemukan: new Date().toISOString(),
  };
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function fetchKaiTenders(): Promise<Lead[]> {
  console.log("[KAI Agent] Memulai — rapid.kai.id (PT KAI Persero)");

  const session = sessionFromEnv() ?? (await loginWithCredentials());

  if (!session) {
    console.warn(
      "[KAI Agent] Tidak ada session aktif. KAI RAPID dilewati.\n" +
      "  Isi salah satu opsi di .env:\n" +
      "  1) KAI_RAPID_SESSION=<JSESSIONID dari browser>\n" +
      "  2) KAI_RAPID_USERNAME + KAI_RAPID_PASSWORD (bisa gagal karena CAPTCHA)"
    );
    return [];
  }

  await sleep(DELAY_MS);

  // Coba DataTables AJAX dulu, fallback ke HTML parse
  let tenders = await fetchViaDataTables(session);

  if (tenders.length === 0) {
    console.log("[KAI Agent] DataTables tidak berhasil — mencoba HTML parse...");
    tenders = await fetchViaHtmlParse(session);
  }

  const leads = tenders.map(toLog);
  console.log(`[KAI Agent] Selesai. ${leads.length} tender IT dari KAI.`);
  return leads;
}
