// src/agents/sources/spseKomdigiAgent.ts
import axios from "axios";
import * as cheerio from "cheerio";
import type { Lead, KategoriKebutuhan, IndustriICP } from "../../config/claude.js";

// ─── Konfigurasi ──────────────────────────────────────────────────────────────

const KLPD_KOMDIGI = "komdigi";
const BASE_URL = `https://spse.inaproc.id/${KLPD_KOMDIGI}`;
const TAHUN = new Date().getFullYear();

// Filter IT keywords
const IT_KEYWORDS = [
  "jaringan", "network", "internet", "teknologi informasi",
  "software", "aplikasi", "sistem informasi", "komputer", "server",
  "hardware", "infrastruktur", "telekomunikasi", "wifi", "fiber",
  "cloud", "hosting", "database", "firewall", "cybersecurity",
  "data center", "CCTV", "keamanan siber",
];

const NILAI_MINIMUM = 100_000_000; // Rp 100 juta
const DELAY_MS = 2_500;
const MAX_PAGES = 3;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Interface ────────────────────────────────────────────────────────────────

interface SPSETender {
  namaPaket: string;
  instansi: string;
  nilaiPagu: number;
  status: string;
  metodePengadaan: string;
  url: string;
  tahapan?: string;
}

// ─── Helper: Get Session Cookie ───────────────────────────────────────────────

async function getSessionCookies(): Promise<string> {
  try {
    const res = await axios.get<string>(`${BASE_URL}/lelang`, {
      timeout: 15_000,
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      maxRedirects: 5,
    });

    const setCookie = res.headers["set-cookie"];
    if (!Array.isArray(setCookie) || setCookie.length === 0) return "";

    return setCookie
      .map((c) => c.split(";")[0] ?? "")
      .filter(Boolean)
      .join("; ");
  } catch (err) {
    console.warn(`[SPSE Komdigi] Failed to get session cookie:`, (err as Error).message);
    return "";
  }
}

// ─── Helper: Filter IT Relevant ───────────────────────────────────────────────

function isITRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  return IT_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

// ─── Helper: Parse Nilai ──────────────────────────────────────────────────────

function parseNilai(str: string): number {
  const clean = str.replace(/[^0-9]/g, "");
  return clean ? parseInt(clean, 10) : 0;
}

// ─── Helper: Klasifikasi ──────────────────────────────────────────────────────

function guessKebutuhan(namaPaket: string): KategoriKebutuhan {
  const lower = namaPaket.toLowerCase();
  if (/jaringan|lan|wan|fiber|optik|wifi|internet|bandwidth/.test(lower)) return "jaringan";
  if (/software|aplikasi|app|web|mobile|sistem informasi/.test(lower)) return "software";
  if (/server|komputer|laptop|hardware|datacenter/.test(lower)) return "it-infrastructure";
  if (/cctv|kamera|surveillance/.test(lower)) return "cctv";
  if (/cloud|hosting/.test(lower)) return "cloud";
  if (/cybersecurity|firewall|keamanan.siber/.test(lower)) return "cybersecurity";
  return "it-infrastructure";
}

// ─── Scraper: SPSE Komdigi via DataTables API ─────────────────────────────────

async function scrapeSPSEKomdigi(page: number = 1): Promise<SPSETender[]> {
  const tenders: SPSETender[] = [];

  try {
    // Get session cookie first
    const cookie = await getSessionCookies();
    const start = (page - 1) * 20;

    // Call DataTables API
    const res = await axios.post<{ data?: any[] }>(
      `${BASE_URL}/dt/lelang?tahun=${TAHUN}`,
      new URLSearchParams({
        draw: "1",
        start: String(start),
        length: "20",
        "search[value]": "",
        "search[regex]": "false",
        "columns[0][data]": "0",
        "order[0][column]": "0",
        "order[0][dir]": "desc",
      }).toString(),
      {
        timeout: 20_000,
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          "Referer": `${BASE_URL}/lelang`,
          "Accept": "application/json, text/javascript, */*; q=0.01",
          ...(cookie ? { "Cookie": cookie } : {}),
        },
      }
    );

    const rows = res.data?.data ?? [];

    for (const row of rows) {
      // Parse row data (bisa array atau object)
      const namaPaket = String(
        row["namaPaket"] ?? row["nama_paket"] ?? row["0"] ??
        (Array.isArray(row) ? row[0] : Object.values(row)[0] ?? "")
      );

      // Filter: IT relevant only
      if (!namaPaket || !isITRelevant(namaPaket)) continue;

      // Parse nilai
      const nilaiRaw = String(row["nilaiPagu"] ?? row["pagu"] ?? row["nilai"] ?? "0");
      const nilaiPagu = parseNilai(nilaiRaw);
      if (nilaiPagu > 0 && nilaiPagu < NILAI_MINIMUM) continue;

      // Parse status/tahapan
      const status = String(row["status"] ?? row["tahapan"] ?? "");
      const tahapan = String(row["tahapan"] ?? row["status"] ?? "");

      // **FILTER PENTING: Hanya "Pengumuman Pasca Kualifikasi"**
      const isPascaKualifikasi =
        status.toLowerCase().includes("pengumuman pasca kualifikasi") ||
        tahapan.toLowerCase().includes("pengumuman pasca kualifikasi") ||
        status.toLowerCase().includes("pasca kualifikasi") ||
        tahapan.toLowerCase().includes("pasca kualifikasi");

      if (!isPascaKualifikasi) continue;

      // Parse URL
      const urlPaket = String(row["url"] ?? row["href"] ?? "");

      tenders.push({
        namaPaket,
        instansi: String(row["instansi"] ?? row["satuanKerja"] ?? "Komdigi"),
        nilaiPagu,
        status,
        metodePengadaan: String(row["metode"] ?? row["metodePengadaan"] ?? "Tender"),
        url: urlPaket.startsWith("http")
          ? urlPaket
          : `${BASE_URL}${urlPaket}`,
        tahapan,
      });
    }

    console.log(
      `[SPSE Komdigi] Hal.${page} (API) → ${tenders.length} tender pasca kualifikasi`
    );
    return tenders;

  } catch (err: unknown) {
    const code = (err as { response?: { status?: number } }).response?.status;
    const msg = err instanceof Error ? err.message : String(err);

    if (code === 403) {
      console.warn(
        `[SPSE Komdigi] ⚠ API 403 (Cloudflare protection). ` +
        `Coba login manual di browser, copy cookie, set SPSE_KOMDIGI_COOKIE di .env`
      );
    } else {
      console.error(`[SPSE Komdigi] ✗ API error: ${msg}`);
    }

    // Fallback: Try HTML scraping
    return await scrapeSPSEKomdigiHTML(page);
  }
}

// ─── Fallback: HTML Scraping ──────────────────────────────────────────────────

async function scrapeSPSEKomdigiHTML(page: number = 1): Promise<SPSETender[]> {
  const tenders: SPSETender[] = [];

  try {
    const res = await axios.get<string>(
      `${BASE_URL}/lelang?page=${page}&tahun=${TAHUN}`,
      {
        timeout: 15_000,
        headers: { "User-Agent": UA, "Accept": "text/html" },
      }
    );

    const $ = cheerio.load(res.data);

    $("table#tbllelang tbody tr, table.table tbody tr").each((_, row) => {
      const cols = $(row).find("td");
      if (cols.length < 3) return;

      const namaPaket = $(cols[0]).text().trim() || $(cols[1]).text().trim();
      if (!namaPaket || !isITRelevant(namaPaket)) return;

      // Find status column (biasanya ada kata "status" atau "tahapan")
      let status = "";
      cols.each((_, col) => {
        const text = $(col).text().trim();
        if (
          text.toLowerCase().includes("pengumuman pasca kualifikasi") ||
          text.toLowerCase().includes("pasca kualifikasi")
        ) {
          status = text;
        }
      });

      // Filter: hanya pasca kualifikasi
      if (!status) return;

      // Parse nilai
      const nilaiText = cols
        .filter((_, el) => /[Rr]p/.test($(el).text()))
        .first()
        .text();
      const nilaiPagu = parseNilai(nilaiText);
      if (nilaiPagu > 0 && nilaiPagu < NILAI_MINIMUM) return;

      const urlPaket = $(row).find("a").first().attr("href") ?? "";

      tenders.push({
        namaPaket,
        instansi: "Komdigi",
        nilaiPagu,
        status,
        metodePengadaan: "Tender",
        url: urlPaket.startsWith("http") ? urlPaket : `${BASE_URL}${urlPaket}`,
      });
    });

    console.log(`[SPSE Komdigi] Hal.${page} (HTML fallback) → ${tenders.length} tender`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SPSE Komdigi] ✗ HTML scraping error: ${msg}`);
  }

  return tenders;
}

// ─── Mapper: SPSETender → Lead ────────────────────────────────────────────────

function toLead(tender: SPSETender): Lead {
  return {
    id: `spse-komdigi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    sumber: "SPSE_KOMDIGI",
    url: tender.url,
    namaProyek: tender.namaPaket,
    namaPerusahaan: tender.instansi,
    industri: "Pemerintah" as IndustriICP,
    lokasi: "Indonesia",
    nilaiProyek: tender.nilaiPagu,
    deadline: "",
    kebutuhan: guessKebutuhan(tender.namaPaket),
    deskripsiKebutuhan:
      `[SPSE KOMDIGI ${TAHUN}] ${tender.metodePengadaan} | ` +
      `Status: ${tender.status} | ${tender.namaPaket}`,
    pic: {
      nama: "",
      jabatan: "Panitia Pengadaan",
      email: "",
      telepon: "",
    },
    score: 0,
    prioritas: "rendah",
    alasanScore: "",
    tanggalDitemukan: new Date().toISOString(),
  };
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function fetchSPSEKomdigiTenders(): Promise<Lead[]> {
  console.log(
    `[SPSE Komdigi] Mulai scraping — spse.inaproc.id/komdigi | ` +
    `Filter: "Pengumuman Pasca Kualifikasi" | Max: ${MAX_PAGES} halaman`
  );

  const allTenders: SPSETender[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const tenders = await scrapeSPSEKomdigi(page);
    allTenders.push(...tenders);

    if (tenders.length === 0) break; // Stop jika halaman kosong
    if (page < MAX_PAGES) await sleep(DELAY_MS);
  }

  const leads = allTenders.map(toLead);

  console.log(
    `[SPSE Komdigi] Selesai. Total: ${leads.length} leads pasca kualifikasi`
  );

  return leads;
}
