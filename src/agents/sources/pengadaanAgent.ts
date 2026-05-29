import axios from "axios";
import { load } from "cheerio";
import type { Lead, KategoriKebutuhan, IndustriICP } from "../../config/claude.js";
import { sleep, SCRAPE_DELAY_MS } from "../../config/claude.js";

// ─── Konfigurasi ──────────────────────────────────────────────────────────────

const BASE_URL     = "https://tender.pengadaan.com/api/v1/tenders";
const AUTH_API_URL = "https://tender.pengadaan.com/api/v1/auth/login";
const SSO_BASE     = "https://login.pengadaan.com";
const TAHUN        = new Date().getFullYear();

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const KEYWORDS = [
  "jaringan",
  "internet",
  "teknologi informasi",
  "telekomunikasi",
  "software",
  "sistem informasi",
  "komputer",
  "server",
  "aplikasi",
  "hardware",
  "infrastruktur IT",
] as const;

// Filter IT keywords
const IT_KEYWORDS = [
  "jaringan", "network", "internet", "teknologi informasi",
  "software", "aplikasi", "sistem informasi", "komputer", "server",
  "hardware", "infrastruktur", "telekomunikasi", "wifi", "fiber",
  "cloud", "hosting", "database", "firewall", "cybersecurity",
];

const EXCLUDE_KEYWORDS = [
  "alat tulis", "ATK", "furniture", "mebel", "kendaraan",
  "cleaning", "catering", "security guard", "tenaga kerja",
  "konstruksi", "sipil", "gedung", "bangunan",
];

const ITEMS_PER_PAGE = 50;
const MAX_PAGES      = 3;
const WINDOW_HARI    = 30;

// ─── Tipe Raw API ─────────────────────────────────────────────────────────────

interface PengadaanCategory {
  name: string;
  slug: string;
}

interface PengadaanItem {
  id:                string;
  title:             string;
  organizerName:     string;
  organizerType:     string;
  budgetAmount:      number;
  estimateAmount:    number;
  publicationStatus: string;
  tenderStart:       string;
  tenderEnd:         string;
  currentSchedule:   string;
  category:          PengadaanCategory;
  qualifications:    string[];
}

interface PengadaanResponse {
  message: string;
  data:    PengadaanItem[];
  meta: {
    pagination: {
      page:       number;
      limit:      number;
      total:      number;
      totalPages: number;
    };
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

interface AuthHeaders {
  Cookie?:        string;
  Authorization?: string;
}

// Minimal cookie jar (Map<name, value>)
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

import type { AxiosResponse } from "axios";

function absorbResponse(jar: Map<string, string>, res: AxiosResponse): void {
  const raw = res.headers["set-cookie"];
  if (!raw) return;
  for (const [k, v] of parseCookieHeaders(Array.isArray(raw) ? raw : [raw])) {
    jar.set(k, v);
  }
}

async function buildAuthHeaders(): Promise<AuthHeaders> {
  // Opsi 1: Bearer token manual dari browser DevTools
  const envToken = process.env["PENGADAAN_TOKEN"]?.trim();
  if (envToken) {
    console.log("[Pengadaan Agent] Menggunakan Bearer token dari PENGADAAN_TOKEN");
    return { Authorization: `Bearer ${envToken}` };
  }

  // Opsi 2: Cookie manual dari browser DevTools
  const envCookie = process.env["PENGADAAN_COOKIE"]?.trim();
  if (envCookie) {
    console.log("[Pengadaan Agent] Menggunakan session cookie dari PENGADAAN_COOKIE");
    return { Cookie: envCookie };
  }

  // Opsi 3: login otomatis via OAuth PKCE flow
  const email    = process.env["PENGADAAN_EMAIL"]?.trim();
  const password = process.env["PENGADAAN_PASSWORD"]?.trim();
  if (!email || !password) return {};

  console.log("[Pengadaan Agent] Mencoba login OAuth dengan email/password...");

  const jar = new Map<string, string>();

  try {
    // ① Inisiasi OAuth — server mengembalikan authUrl + PKCE params
    const initRes = await axios.get<{ authUrl?: string }>(AUTH_API_URL, {
      timeout: 15_000,
      headers: { "User-Agent": UA, Accept: "application/json" },
      validateStatus: (s) => s < 500,
    });
    absorbResponse(jar, initRes);

    const authUrl = initRes.data?.authUrl;
    if (!authUrl) throw new Error("authUrl tidak ada dalam response init");

    // ② Ikuti authUrl → login.pengadaan.com (dapat form login)
    const oauthPageRes = await axios.get(authUrl, {
      timeout: 15_000,
      headers: { "User-Agent": UA, Cookie: cookiesToString(jar) },
      maxRedirects: 5,
      validateStatus: (s) => s < 500,
    });
    absorbResponse(jar, oauthPageRes);

    const html = oauthPageRes.data as string;
    const $    = load(html);

    const csrf             = $('input[name="__RequestVerificationToken"]').val() as string ?? "";
    const callSite         = $('input[name="CallSite"]').val() as string ?? "";
    const retUrl           = $('input[name="RetUrl"]').val() as string ?? "";
    const returnCompleteUrl = $('input[name="ReturnCompleteUrl"]').val() as string ?? "";
    const hidxCode         = $('input[name="HidxCode"]').val() as string ?? "";

    if (!csrf) {
      // Jika tidak ada CSRF token, kita tidak di halaman login yang benar
      throw new Error("CSRF token tidak ditemukan di halaman login");
    }

    // ③ POST kredensial ke SSO
    const loginBody = new URLSearchParams();
    loginBody.append("Email",                       email);
    loginBody.append("Password",                    password);
    loginBody.append("captcha",                     "");
    loginBody.append("CallSite",                    callSite);
    loginBody.append("LangX",                       "id-ID");
    loginBody.append("ReturnCompleteUrl",            returnCompleteUrl);
    loginBody.append("RetUrl",                      retUrl);
    loginBody.append("HidxCode",                    hidxCode);
    loginBody.append("__RequestVerificationToken",  csrf);

    const loginRes = await axios.post(`${SSO_BASE}/sso/login`, loginBody, {
      timeout: 20_000,
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        "Cookie":        cookiesToString(jar),
        "User-Agent":    UA,
        "Referer":       `${SSO_BASE}/`,
        "Origin":        SSO_BASE,
      },
      maxRedirects: 0,
      validateStatus: (s) => s < 500,
    });
    absorbResponse(jar, loginRes);

    const location = loginRes.headers["location"] as string ?? "";

    // Jika redirect ke halaman lain atau kembali ke login → gagal (CAPTCHA / salah password)
    if (!location || location.includes("login") || loginRes.status === 200) {
      const bodyStr = (loginRes.data ?? "") as string;
      const isFailed = !location ||
        location.toLowerCase().includes("login") ||
        bodyStr.includes("captcha") ||
        bodyStr.includes("invalid");

      if (isFailed) {
        console.warn(
          "[Pengadaan Agent] Login gagal — kemungkinan CAPTCHA atau kredensial salah.\n" +
          "  Alternatif: login manual di browser, buka DevTools → Network → cari Bearer token,\n" +
          "  lalu set PENGADAAN_TOKEN=<token> di .env"
        );
        return {};
      }
    }

    // ④ Ikuti redirect ke callback (tender.pengadaan.com/api/v1/auth/oauth/callback?code=...)
    const callbackUrl = location.startsWith("http")
      ? location
      : `https://tender.pengadaan.com${location}`;

    const callbackRes = await axios.get(callbackUrl, {
      timeout: 15_000,
      headers: { "Cookie": cookiesToString(jar), "User-Agent": UA },
      maxRedirects: 5,
      validateStatus: (s) => s < 500,
    });
    absorbResponse(jar, callbackRes);

    const cookieStr = cookiesToString(jar);
    if (!cookieStr) throw new Error("Tidak ada cookie setelah callback");

    console.log("[Pengadaan Agent] Login OAuth berhasil — mode terautentikasi aktif");
    return { Cookie: cookieStr };

  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`[Pengadaan Agent] Auth gagal (${msg}) — melanjutkan mode anonymous`);
    return {};
  }
}

// ─── Helper: Filter IT ────────────────────────────────────────────────────────

function isITRelevant(text: string): boolean {
  const t = text.toLowerCase();

  // Exclude non-IT first
  if (EXCLUDE_KEYWORDS.some(kw => t.includes(kw.toLowerCase()))) {
    return false;
  }

  // Check if contains IT keywords
  return IT_KEYWORDS.some(kw => t.includes(kw.toLowerCase()));
}

// ─── Helper: Klasifikasi ──────────────────────────────────────────────────────

function guessKebutuhan(title: string): KategoriKebutuhan {
  const t = title.toLowerCase();
  if (/jaringan|lan|wan|fiber|optik|wifi|wimax|bwa|switch|router|internet|vsat|bandwidth/.test(t))
    return "jaringan";
  if (/software|aplikasi|app|web|mobile|erp|sistem informasi|portal|e-gov/.test(t))
    return "software";
  if (/server|komputer|laptop|pc|printer|hardware|datacenter|storage/.test(t))
    return "it-infrastructure";
  if (/cctv|kamera|surveillance|nvr|dvr|access control/.test(t))
    return "cctv";
  if (/cloud|hosting|vps|saas/.test(t))
    return "cloud";
  if (/integrasi|api|middleware/.test(t))
    return "sistem-integrasi";
  if (/firewall|cybersecurity|keamanan.siber|vpn/.test(t))
    return "cybersecurity";
  if (/telekomunikasi/.test(t))
    return "jaringan";
  return "it-infrastructure";
}

function guessIndustri(organizerName: string, organizerType: string): IndustriICP {
  const n = organizerName.toLowerCase();
  const t = organizerType.toLowerCase();

  if (/pertamina|migas|energi|minyak|gas/.test(n))                    return "Migas";
  if (/tambang|mineral|batu.?bara|nikel|freeport/.test(n))            return "Pertambangan";
  if (/bank|bri|bni|mandiri|btn|ojk|bjb/.test(n))                    return "Perbankan";
  if (/rs |rsud|rsup|rumah.sakit|puskesmas|dinkes|kesehatan/.test(n)) return "Kesehatan";
  if (/universitas|sekolah|diknas|disdik|pendidikan/.test(n))         return "Pendidikan";
  if (/bumn|bumd|persero|pelindo|garuda|pln|telkom|kima/.test(n))     return "BUMN";
  if (/bumn/.test(t) || /bumd/.test(t))                               return "BUMN";
  if (/pabrik|manufaktur|industri/.test(n))                           return "Manufaktur";

  return "Pemerintah";
}

// ─── Fetch Satu Halaman ───────────────────────────────────────────────────────

async function fetchPage(
  keyword: string,
  page: number,
  authHeaders: AuthHeaders
): Promise<{ items: PengadaanItem[]; totalPages: number }> {
  const response = await axios.get<PengadaanResponse>(BASE_URL, {
    params: {
      q:     keyword,
      page,
      limit: ITEMS_PER_PAGE,
      sort:  "-tenderEnd",
    },
    timeout: 20_000,
    headers: {
      "User-Agent": UA,
      "Accept":     "application/json",
      "Referer":    "https://tender.pengadaan.com/",
      "Origin":     "https://tender.pengadaan.com",
      ...authHeaders,
    },
  });

  return {
    items:      response.data.data ?? [],
    totalPages: response.data.meta?.pagination?.totalPages ?? 1,
  };
}

// ─── Mapper: PengadaanItem → Lead ────────────────────────────────────────────

function toLead(item: PengadaanItem): Lead {
  const nilaiProyek = item.budgetAmount > 0
    ? item.budgetAmount
    : item.estimateAmount > 0
      ? item.estimateAmount
      : 0;

  return {
    id:             `pgd-${item.id}`,
    sumber:         "PENGADAAN",
    url:            `https://tender.pengadaan.com/tender/${item.id}`,
    namaProyek:     item.title,
    namaPerusahaan: item.organizerName,
    industri:       guessIndustri(item.organizerName, item.organizerType),
    lokasi:         "Indonesia",
    nilaiProyek,
    deadline:       item.tenderEnd ?? "",
    kebutuhan:      guessKebutuhan(item.title),
    deskripsiKebutuhan:
      `[TENDER ${TAHUN}] ${item.category?.name ?? "Pengadaan"} | ` +
      `Status: ${item.publicationStatus} | Jadwal: ${item.currentSchedule} | ` +
      item.title,
    pic: {
      nama:    "",
      jabatan: "Panitia Pengadaan",
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

export async function fetchPengadaanTenders(): Promise<Lead[]> {
  // Auth — gagal auth tetap lanjut dengan mode anonymous
  const authHeaders = await buildAuthHeaders();
  const mode = Object.keys(authHeaders).length > 0 ? "terautentikasi" : "anonymous";
  console.log(`[Pengadaan Agent] Mulai — tender.pengadaan.com | mode: ${mode} | ${KEYWORDS.length} keyword`);

  const seen  = new Set<string>();
  const leads: Lead[] = [];

  for (const keyword of KEYWORDS) {
    console.log(`[Pengadaan Agent] Keyword: "${keyword}"`);
    let totalDariKeyword = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      try {
        const { items, totalPages } = await fetchPage(keyword, page, authHeaders);

        let newOnPage = 0;
        const cutoff  = Date.now() - WINDOW_HARI * 86_400_000;

        for (const item of items) {
          if (!item.id || seen.has(item.id)) continue;

          // Filter: hanya yang masih dibuka & deadline belum lewat
          if (item.publicationStatus !== "masih-dibuka") continue;

          const endMs = item.tenderEnd ? new Date(item.tenderEnd).getTime() : Infinity;
          if (endMs < cutoff) continue;

          // Filter: hanya IT-relevant
          const textToCheck = `${item.title} ${item.category?.name || ""}`;
          if (!isITRelevant(textToCheck)) continue;

          seen.add(item.id);
          leads.push(toLead(item));
          newOnPage++;
          totalDariKeyword++;
        }

        console.log(
          `[Pengadaan Agent]   hal.${page}/${Math.min(totalPages, MAX_PAGES)} → ` +
          `${newOnPage} lead baru (aktif/≤${WINDOW_HARI}hr) | total: ${leads.length}`
        );

        if (page >= totalPages) break;
        await sleep(SCRAPE_DELAY_MS);

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Pengadaan Agent] ✗ "${keyword}" hal.${page}: ${msg}`);
        break;
      }
    }

    console.log(`[Pengadaan Agent] "${keyword}" selesai → ${totalDariKeyword} lead baru\n`);
    await sleep(SCRAPE_DELAY_MS);
  }

  console.log(`[Pengadaan Agent] Selesai. Total unik: ${leads.length}`);
  return leads;
}
