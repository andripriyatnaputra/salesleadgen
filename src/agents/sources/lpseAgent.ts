// src/agents/sources/lpseAgent.ts
import axios from "axios";
import * as cheerio from "cheerio";
import type { Lead, KategoriKebutuhan, IndustriICP } from "../../config/claude.js";

// ─── Interface Scraping Internal ──────────────────────────────────────────────

export interface TenderLead {
  namaPaket:       string;
  instansi:        string;
  kategori:        string; // "TENDER" | "RUP"
  nilaiPagu:       number;
  tahunAnggaran:   string;
  metodePengadaan: string;
  urlSumber:       string;
  tanggalAmbil:    string;
}

// ─── Konfigurasi ──────────────────────────────────────────────────────────────

// Kode KLPD di SPSE inaproc.id — sesuaikan dengan target instansi Starcom
const KLPD_TARGETS = [
  { kode: "nasional", nama: "SPSE Nasional"    },
  { kode: "pu",       nama: "Kementerian PU"   },
  { kode: "lkpp",     nama: "LKPP"             },
  { kode: "kominfo",  nama: "Kominfo"           },
  { kode: "bssn",     nama: "BSSN"             },
  { kode: "brin",     nama: "BRIN"             },
];

const KEYWORDS_IT = [
  "jaringan", "internet", "broadband", "wifi", "fiber",
  "server", "data center", "cloud", "hosting",
  "software", "aplikasi", "sistem informasi", "website",
  "IT", "teknologi informasi", "komputer", "laptop",
  "CCTV", "keamanan siber", "cybersecurity",
  "telekomunikasi", "WAN", "LAN", "VPN",
];

const SIRUP_KEYWORDS = [
  "jaringan komputer", "server", "software",
  "sistem informasi", "CCTV", "fiber optik",
];

const NILAI_MINIMUM = 100_000_000;
const DELAY_MS      = 2_500;
const TAHUN         = new Date().getFullYear();

// User-Agent yang menyerupai browser nyata
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Cookie Jar Sederhana ─────────────────────────────────────────────────────
// SPSE/inaproc.id dilindungi Cloudflare — perlu CF cookie dari halaman HTML
// sebelum hit DataTables API endpoint (/dt/lelang). Tanpa cookie ini → 403.

async function getSessionCookies(kodeKlpd: string): Promise<string> {
  try {
    const res = await axios.get<string>(
      `https://spse.inaproc.id/${kodeKlpd}/lelang`,
      {
        timeout: 15_000,
        headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
        maxRedirects: 5,
      }
    );

    // Ambil Set-Cookie dari response header
    const setCookie = res.headers["set-cookie"];
    if (!Array.isArray(setCookie) || setCookie.length === 0) return "";

    // Format jadi string "name=value; name2=value2"
    return setCookie
      .map((c) => c.split(";")[0] ?? "")
      .filter(Boolean)
      .join("; ");
  } catch {
    return "";
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function isRelevant(namaPaket: string): boolean {
  const lower = namaPaket.toLowerCase();
  return KEYWORDS_IT.some((kw) => lower.includes(kw.toLowerCase()));
}

function parseNilai(str: string): number {
  const clean = str.replace(/[^0-9]/g, "");
  return clean ? parseInt(clean, 10) : 0;
}

// ─── Scraper A: SPSE via DataTables API ──────────────────────────────────────
// Endpoint: /dt/lelang — butuh cookie sesi dari halaman HTML terlebih dahulu.
// Jika 403 (CF challenge aktif), fallback ke scrape HTML biasa.

async function scrapeSPSE(
  kodeKlpd: string,
  namaKlpd: string,
  page: number = 1
): Promise<TenderLead[]> {
  const leads: TenderLead[] = [];
  const baseUrl = `https://spse.inaproc.id/${kodeKlpd}`;

  // Strategi 1: DataTables JSON API (lebih bersih)
  try {
    const cookie = await getSessionCookies(kodeKlpd);
    const start  = (page - 1) * 20;

    const res = await axios.post<{ data?: Record<string, string>[] }>(
      `${baseUrl}/dt/lelang?tahun=${TAHUN}`,
      new URLSearchParams({
        draw:                "1",
        "start":             String(start),
        "length":            "20",
        "search[value]":     "",         // search kosong, filter pakai isRelevant()
        "search[regex]":     "false",
        "columns[0][data]":  "0",
        "order[0][column]":  "0",
        "order[0][dir]":     "desc",
      }).toString(),
      {
        timeout: 20_000,
        headers: {
          "User-Agent":      UA,
          "Content-Type":    "application/x-www-form-urlencoded",
          "X-Requested-With":"XMLHttpRequest",
          "Referer":         `${baseUrl}/lelang`,
          "Accept":          "application/json, text/javascript, */*; q=0.01",
          ...(cookie ? { "Cookie": cookie } : {}),
        },
      }
    );

    const rows = res.data?.data ?? [];

    for (const row of rows) {
      // Row bisa berupa array atau object — handle keduanya
      const namaPaket =
        (typeof row === "object"
          ? (row["namaPaket"] ?? row["nama_paket"] ?? row["0"] ?? Object.values(row)[0])
          : "") as string;

      if (!namaPaket || !isRelevant(String(namaPaket))) continue;

      const nilaiRaw  = (row["nilaiPagu"] ?? row["pagu"] ?? row["nilai"] ?? "0") as string;
      const nilaiPagu = parseNilai(String(nilaiRaw));
      if (nilaiPagu > 0 && nilaiPagu < NILAI_MINIMUM) continue;

      const urlPaket = (row["url"] ?? row["href"] ?? "") as string;

      leads.push({
        namaPaket:       String(namaPaket),
        instansi:        namaKlpd,
        kategori:        "TENDER",
        nilaiPagu,
        tahunAnggaran:   String(TAHUN),
        metodePengadaan: String(row["metode"] ?? row["metodePengadaan"] ?? "Tender"),
        urlSumber:       urlPaket.startsWith("http")
          ? urlPaket
          : `https://spse.inaproc.id${urlPaket}`,
        tanggalAmbil: new Date().toISOString(),
      });
    }

    console.log(`[LPSE Agent] SPSE ${namaKlpd} hal.${page} (API) → ${leads.length} paket`);
    return leads;

  } catch (errApi: unknown) {
    const code = (errApi as { response?: { status?: number } }).response?.status;
    const msg  = errApi instanceof Error ? errApi.message : String(errApi);

    // 403 = CF bot protection aktif → fallback ke scrape HTML
    if (code === 403) {
      console.log(`[LPSE Agent] ${namaKlpd} API 403 (Cloudflare) → fallback HTML scrape`);
    } else {
      console.log(`[LPSE Agent] ✗ SPSE ${namaKlpd} API: ${msg} → fallback HTML scrape`);
    }
  }

  // Strategi 2: HTML scrape (tabel mungkin kosong karena DataTables, tapi coba dulu)
  try {
    const res = await axios.get<string>(
      `https://spse.inaproc.id/${kodeKlpd}/lelang?page=${page}`,
      {
        timeout: 15_000,
        headers: { "User-Agent": UA, "Accept": "text/html" },
      }
    );

    const $   = cheerio.load(res.data);
    let found = 0;

    $("table#tbllelang tbody tr, table.table tbody tr").each((_, row) => {
      const cols     = $(row).find("td");
      if (cols.length < 2) return;

      const namaPaket = $(cols[0]).text().trim() || $(cols[1]).text().trim();
      if (!namaPaket || !isRelevant(namaPaket)) return;

      const nilaiText = cols
        .filter((_, el) => /[Rr]p/.test($(el).text()))
        .first()
        .text();
      const nilaiPagu = parseNilai(nilaiText);
      if (nilaiPagu > 0 && nilaiPagu < NILAI_MINIMUM) return;

      const urlPaket = $(row).find("a").first().attr("href") ?? "";

      leads.push({
        namaPaket,
        instansi:        namaKlpd,
        kategori:        "TENDER",
        nilaiPagu,
        tahunAnggaran:   String(TAHUN),
        metodePengadaan: "Tender",
        urlSumber:       urlPaket.startsWith("http")
          ? urlPaket
          : `https://spse.inaproc.id${urlPaket}`,
        tanggalAmbil: new Date().toISOString(),
      });
      found++;
    });

    console.log(`[LPSE Agent] SPSE ${namaKlpd} hal.${page} (HTML) → ${found} paket`);

    // Peringatan jika tabel kosong (kemungkinan DataTables belum render)
    if (found === 0) {
      console.log(
        `[LPSE Agent] ⚠ Tabel kosong — SPSE menggunakan DataTables (async), ` +
        `data perlu diambil via API endpoint /dt/lelang yang memerlukan sesi browser.`
      );
    }
  } catch (errHtml: unknown) {
    const msg = errHtml instanceof Error ? errHtml.message : String(errHtml);
    console.log(`[LPSE Agent] ✗ SPSE ${namaKlpd} HTML: ${msg}`);
  }

  return leads;
}

// ─── Scraper B: SIRUP (Rencana Umum Pengadaan) ───────────────────────────────
// Domain resmi: sirup.lkpp.go.id — endpoint publik tanpa autentikasi.
// sirup.inaproc.id me-redirect ke halaman login — tidak bisa dipakai.

interface SirupItem {
  namaPaket?:       string;
  nama_paket?:      string;
  namaKlpd?:        string;
  satker?:          string;
  paguPaket?:       number | string;
  nilai_pagu?:      number | string;
  metodePengadaan?: string;
  tahunAnggaran?:   string | number;
}

async function scrapeSIRUP(keyword: string): Promise<TenderLead[]> {
  const leads: TenderLead[] = [];

  // sirup.lkpp.go.id adalah domain resmi SIRUP yang beroperasi
  const url =
    `https://sirup.lkpp.go.id/sirup/ro/caripaket2` +
    `?tahunAnggaran=${TAHUN}&namaRUP=${encodeURIComponent(keyword)}` +
    `&draw=1&start=0&length=50`;

  try {
    const res = await axios.get<{ data?: SirupItem[]; aaData?: SirupItem[] }>(url, {
      timeout: 20_000,
      headers: {
        "User-Agent": UA,
        "Accept":     "application/json, text/javascript, */*",
        "Referer":    "https://sirup.lkpp.go.id/sirup/caripaketctr/index",
      },
    });

    const data: SirupItem[] = res.data?.data ?? res.data?.aaData ?? [];

    for (const item of data) {
      const nilaiPagu = parseFloat(String(item.paguPaket ?? item.nilai_pagu ?? 0));
      if (nilaiPagu < NILAI_MINIMUM) continue;

      leads.push({
        namaPaket:       item.namaPaket ?? item.nama_paket ?? "",
        instansi:        item.namaKlpd  ?? item.satker     ?? "",
        kategori:        "RUP",
        nilaiPagu,
        tahunAnggaran:   String(item.tahunAnggaran ?? TAHUN),
        metodePengadaan: item.metodePengadaan ?? "Belum ditentukan",
        urlSumber:       "https://sirup.lkpp.go.id",
        tanggalAmbil:    new Date().toISOString(),
      });
    }

    console.log(`[LPSE Agent] SIRUP "${keyword}" → ${leads.length} RUP`);
  } catch (err: unknown) {
    const code = (err as { response?: { status?: number } }).response?.status;
    const msg  = err instanceof Error ? err.message : String(err);

    if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
      // Ini bukan error kode — ini DNS resolution failure (umum di WSL/sandbox)
      console.log(
        `[LPSE Agent] ✗ SIRUP DNS gagal resolve "sirup.lkpp.go.id" — ` +
        `normal di WSL/sandbox; akan bekerja di server produksi. (${msg})`
      );
    } else {
      console.log(`[LPSE Agent] ✗ SIRUP "${keyword}": HTTP ${code ?? "—"} ${msg}`);
    }
  }

  return leads;
}

// ─── Mapper: TenderLead → Lead ────────────────────────────────────────────────

function guessKebutuhan(namaPaket: string): KategoriKebutuhan {
  const t = namaPaket.toLowerCase();
  if (/jaringan|lan|wan|fiber|optik|wifi|wimax|bwa|switch|router|network|internet|vsat|bandwidth/.test(t))
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
  return "it-infrastructure";
}

function guessIndustri(namaInstansi: string): IndustriICP {
  const n = namaInstansi.toLowerCase();
  if (/pertamina|migas|energi|minyak|gas/.test(n))                     return "Migas";
  if (/tambang|mineral|batu.?bara|nikel/.test(n))                      return "Pertambangan";
  if (/bank|bri|bni|mandiri|btn|ojk/.test(n))                          return "Perbankan";
  if (/rs |rsud|rsup|rumah.sakit|puskesmas|dinkes|kesehatan/.test(n))  return "Kesehatan";
  if (/universitas|sekolah|diknas|disdik|pendidikan/.test(n))          return "Pendidikan";
  if (/persero|bumn|pelindo|garuda|pln|telkom/.test(n))                return "BUMN";
  if (/pabrik|manufaktur|industri/.test(n))                            return "Manufaktur";
  return "Pemerintah";
}

function extractLokasi(namaInstansi: string): string {
  const m = namaInstansi.match(/\b(kota|kabupaten|provinsi|prov\.?)\s+([\w\s]+?)(?:\s|$)/i);
  if (m?.[2]) return m[2].trim();
  return "Indonesia";
}

function tenderLeadToLead(t: TenderLead, index: number): Lead {
  return {
    id:                 `lpse-${index}-${t.namaPaket.slice(0, 20).replace(/\s+/g, "-")}`,
    sumber:             "LPSE",
    url:                t.urlSumber,
    namaProyek:         t.namaPaket,
    namaPerusahaan:     t.instansi,
    industri:           guessIndustri(t.instansi),
    lokasi:             extractLokasi(t.instansi),
    nilaiProyek:        t.nilaiPagu,
    deadline:           "",
    kebutuhan:          guessKebutuhan(t.namaPaket),
    deskripsiKebutuhan:
      `[${t.kategori} ${t.tahunAnggaran}] ${t.metodePengadaan}: ${t.namaPaket}`,
    pic:            { nama: "", jabatan: "Pejabat Pengadaan", email: "", telepon: "" },
    score:          0,
    prioritas:      "rendah",
    alasanScore:    "",
    tanggalDitemukan: t.tanggalAmbil,
  };
}

// ─── Entry Point Internal ─────────────────────────────────────────────────────

export async function runLpseAgent(): Promise<TenderLead[]> {
  console.log(`[LPSE Agent] Mulai — target: spse.inaproc.id & sirup.lkpp.go.id`);
  const allLeads: TenderLead[] = [];
  const seen = new Set<string>();

  const add = (leads: TenderLead[]) => {
    for (const l of leads) {
      const key = l.namaPaket + "|" + l.instansi;
      if (!seen.has(key)) { seen.add(key); allLeads.push(l); }
    }
  };

  // 1. Scrape SPSE per KLPD (halaman 1 & 2)
  for (const klpd of KLPD_TARGETS) {
    for (const page of [1, 2]) {
      add(await scrapeSPSE(klpd.kode, klpd.nama, page));
      await sleep(DELAY_MS);
    }
  }

  // 2. Scrape SIRUP per keyword
  for (const kw of SIRUP_KEYWORDS) {
    add(await scrapeSIRUP(kw));
    await sleep(DELAY_MS);
  }

  console.log(`[LPSE Agent] Selesai. Total unik: ${allLeads.length} paket`);
  return allLeads;
}

// ─── Entry Point Pipeline ─────────────────────────────────────────────────────
// Dipanggil oleh index.ts — konversi TenderLead[] → Lead[] langsung.

export async function fetchLpseTenders(): Promise<Lead[]> {
  const tenders = await runLpseAgent();
  return tenders.map((t, i) => tenderLeadToLead(t, i));
}
