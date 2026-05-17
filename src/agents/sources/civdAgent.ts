import axios from "axios";
import { load } from "cheerio";
import { readFile } from "fs/promises";
import { resolve } from "path";
import type { Lead, KategoriKebutuhan } from "../../config/claude.js";
import { sleep } from "../../config/claude.js";
import { processProcurementList } from "./civdProcurementParser.js";

// ─── Konfigurasi ──────────────────────────────────────────────────────────────
// Data publik — tidak butuh login. Cukup JSESSIONID dari GET index.jwebs.
// Endpoint: POST /ajax/search/tnd.jwebs;JSESSIONID=<id>
//   type=1  → Undangan Prakualifikasi (individual tender per KKKS operator)
//   type=3  → Daftar Pengadaan/Procurement List (biasanya 1 PDF per tahun)
// Pagination: GET /ajax/search/tnd.jwebs?type=1&keyword=&d-1789-p=<page>

const BASE_URL   = "https://civd.skkmigas.go.id";
const INDEX_URL  = `${BASE_URL}/index.jwebs`;
const AJAX_PATH  = "/ajax/search/tnd.jwebs";
const ITEMS_PAGE = 6;
const MAX_PAGES  = 15; // 15 × 6 = 90 item maks
const DELAY_MS   = 1500;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ─── Filter IT ────────────────────────────────────────────────────────────────

const IT_KEYWORDS = [
  "jaringan", "network", "internet", "telekomunikasi", "fiber",
  "wifi", "vsat", "bandwidth", "radio", "komunikasi data",
  "sistem informasi", "aplikasi", "software", "perangkat lunak",
  "it ", " it,", " it.", "teknologi informasi", "tik",
  "server", "komputer", "hardware", "perangkat keras", "datacenter",
  "cloud", "hosting", "virtualisasi",
  "cctv", "kamera", "surveillance", "access control",
  "scada", "iot", "sensor", "monitoring system", "instrumentasi",
  "integrasi sistem", "erp", "sap", "oracle",
  "load balancer", "firewall", "switch", "router", "access point",
  "storage", "backup", "disaster recovery",
  "database", "sql", "crm",
];

const EXCLUDE_KEYWORDS = [
  "permit", "amdal", "andal", "ukl", "upl", "izin lingkungan",
  "drilling", "pengeboran", "sumur", "well", "rig",
  "piping", "pipa", "pipeline",
  "civil work", "konstruksi sipil", "bangunan",
  "mechanical", "mekanik", "rotating equipment",
  "electrical non-it", "kelistrikan",
  "catering", "katering", "konsumsi",
  "transportasi", "kendaraan", "mobil", "truk",
  "chemical", "kimia", "bahan kimia",
  "medis non-it", "alat kesehatan", "medical service",
  "safety equipment", "alat k3", "apd",
  "housekeeping", "cleaning service",
  "satpam", "tenaga kerja bantu pengamanan", "jasa pengamanan",
  "security service for", // "security service for [operational]" = guard, bukan CCTV
  "boat", "kapal", "vessel", "crew boat", "tug boat", "utility boat",
  "charter", "sewa kapal", "offshore vessel",
  "workover", "coiled tubing", "fracturing",
  "rock bit", "drill bit",
  "h2s monitoring", "gas monitoring", "environmental monitoring",
  "desalination", "water treatment plant",
  "gas recovery system", "gas asso recovery",
  "cargo carrying", "cargo unit",
  "sewa menyewa lantai", "rental office", "sewa ruang",
  "hr personnel", "human resource", "hr&it personnel",
  "storage tank", "oil storage", "water tank", "tangki", "tanker",
  "floating storage", "offloading", "lay up",
];

function shouldExclude(text: string): boolean {
  const t = text.toLowerCase();
  return EXCLUDE_KEYWORDS.some((kw) => t.includes(kw));
}

function isITRelevant(text: string): boolean {
  const t = text.toLowerCase();
  if (shouldExclude(t)) return false;
  return IT_KEYWORDS.some((kw) => t.includes(kw));
}

function isDateValid(dateStr: string): boolean {
  if (!dateStr || !dateStr.trim()) return true;

  try {
    const bulanMap: Record<string, number> = {
      januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
      juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
    };

    let targetDate: Date | null = null;

    const matchLong = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/i);
    if (matchLong) {
      const day = parseInt(matchLong[1], 10);
      const monthName = matchLong[2].toLowerCase();
      const year = parseInt(matchLong[3], 10);
      const month = bulanMap[monthName];
      if (month !== undefined) {
        targetDate = new Date(year, month, day);
      }
    }

    if (!targetDate) {
      targetDate = new Date(dateStr);
    }

    if (!targetDate || isNaN(targetDate.getTime())) {
      return true;
    }

    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const targetMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);

    return targetMonth >= currentMonth;
  } catch {
    return true;
  }
}

// ─── Ambil JSESSIONID (tidak butuh login) ─────────────────────────────────────

async function getJsessionId(): Promise<string | null> {
  try {
    const res = await axios.get(INDEX_URL, {
      timeout: 20_000,
      headers: { "User-Agent": UA, Accept: "text/html" },
      maxRedirects: 3,
    });

    const setCookieHeader = res.headers["set-cookie"];
    const raw = Array.isArray(setCookieHeader)
      ? setCookieHeader.join("; ")
      : (setCookieHeader ?? "");

    const match = raw.match(/JSESSIONID=([^;,\s]+)/i);
    return match?.[1] ?? null;
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
      console.warn(
        `[CIVD Agent] DNS/koneksi gagal ke civd.skkmigas.go.id: ${msg}\n` +
        "  Kemungkinan masalah DNS di WSL2."
      );
    } else {
      console.warn(`[CIVD Agent] Gagal ambil JSESSIONID: ${msg}`);
    }
    return null;
  }
}

// ─── Tipe Internal ────────────────────────────────────────────────────────────

interface CivdTender {
  judul:    string;
  kkks:     string;
  jenis:    string;   // Barang / Jasa
  golongan: string;   // Besar / Menengah / Kecil
  bidang:   string;   // Bidang Usaha
  tayang:   string;   // "Tayang hingga DD Mmm YYYY"
  fileId:   string;
  deskripsi: string;
}

// ─── Parse HTML Fragment Dari Server ─────────────────────────────────────────

function parseCards(html: string): CivdTender[] {
  const $       = load(html);
  const results: CivdTender[] = [];

  $(".card, .card-body").each((_, card) => {
    const el    = $(card);
    const judul = el.find("h5.card-title, h4.card-title").first().text().trim();
    if (!judul) return;

    // KKKS operator — biasanya di <strong><i>...</i></strong>
    const kkks = el.find("strong i, .card-subtitle, .text-muted strong")
      .first().text().trim() || "SKK Migas / Operator Migas";

    // Teks semua paragraf & li untuk metadata
    const allText = el.text();

    // Bidang usaha
    const bidangMatch = allText.match(/Bidang Usaha[:\s]+([^\n]+)/i);
    const bidang = bidangMatch?.[1]?.trim() ?? "";

    // Jenis pengadaan
    const jenisMatch = allText.match(/Jenis Pengadaan[:\s]+([^\n]+)/i);
    const jenis = jenisMatch?.[1]?.trim() ?? "";

    // Golongan usaha
    const golonganMatch = allText.match(/Golongan Usaha[:\s]+([^\n]+)/i);
    const golongan = golonganMatch?.[1]?.trim() ?? "";

    // Tayang hingga
    const tayangMatch = allText.match(/[Tt]ayang\s+hingga\s+([\d]+ \w+ \d{4})/);
    const tayang = tayangMatch?.[1]?.trim() ?? "";

    // File ID untuk link download
    const fileId = el.find("[data-file-id]").attr("data-file-id") ?? "";

    // Deskripsi dari card-text
    const deskripsi = el.find("p.card-text, .card-body p").first().text().trim();

    results.push({ judul, kkks, jenis, golongan, bidang, tayang, fileId, deskripsi });
  });

  return results;
}

function parseTotalItems(html: string): number {
  // "N items was found, displays X to Y data."
  const match = html.match(/(\d+)\s+items?\s+was\s+found/i);
  return match ? parseInt(match[1], 10) : 0;
}

// ─── Fetch Satu Batch (POST halaman pertama) ──────────────────────────────────

async function fetchFirstPage(
  jsessionid: string,
  type: 1 | 3,
  keyword: string = ""
): Promise<{ tenders: CivdTender[]; totalItems: number }> {
  const endpoint = `${BASE_URL}${AJAX_PATH};JSESSIONID=${jsessionid}`;
  const body = new URLSearchParams({
    type:    String(type),
    keyword,
  });

  const res = await axios.post<string>(endpoint, body, {
    timeout: 20_000,
    headers: {
      "Content-Type":     "application/x-www-form-urlencoded",
      "Cookie":           `JSESSIONID=${jsessionid}`,
      "User-Agent":       UA,
      "Referer":          `${INDEX_URL}#${type === 1 ? "invitation" : "proclist"}`,
      "X-Requested-With": "XMLHttpRequest",
      "Accept":           "text/html, */*; q=0.01",
    },
    validateStatus: (s) => s < 500,
  });

  const html = res.data;
  return {
    tenders:    parseCards(html),
    totalItems: parseTotalItems(html),
  };
}

// ─── Fetch Halaman Berikutnya (GET dengan pagination param) ───────────────────

async function fetchPage(
  jsessionid: string,
  type: 1 | 3,
  page: number,
  keyword: string = ""
): Promise<CivdTender[]> {
  const url = `${BASE_URL}${AJAX_PATH};JSESSIONID=${jsessionid}`;
  const res = await axios.get<string>(url, {
    params: { type, keyword, "d-1789-p": page },
    timeout: 20_000,
    headers: {
      "Cookie":           `JSESSIONID=${jsessionid}`,
      "User-Agent":       UA,
      "Referer":          `${INDEX_URL}#${type === 1 ? "invitation" : "proclist"}`,
      "X-Requested-With": "XMLHttpRequest",
      "Accept":           "text/html, */*; q=0.01",
    },
    validateStatus: (s) => s < 500,
  });

  return parseCards(res.data);
}

// ─── Konversi ke Lead ─────────────────────────────────────────────────────────

function guessKebutuhan(title: string, bidang: string, deskripsi: string): KategoriKebutuhan {
  const t = `${title} ${bidang} ${deskripsi}`.toLowerCase();
  if (/jaringan|network|wifi|fiber|vsat|internet|telekomunikasi|bandwidth/.test(t)) return "jaringan";
  if (/server|hardware|komputer|laptop|datacenter|perangkat keras/.test(t))         return "it-infrastructure";
  if (/cctv|kamera|surveillance|access control/.test(t))                            return "cctv";
  if (/scada|iot|sensor|monitoring system|instrumentasi/.test(t))                   return "sistem-integrasi";
  if (/integrasi|erp|sap|oracle|middleware/.test(t))                               return "sistem-integrasi";
  if (/cloud|hosting|vps|virtualisasi/.test(t))                                    return "cloud";
  return "software";
}

function toLog(t: CivdTender, idx: number): Lead {
  // URL ke portal CIVD (tidak ada halaman detail individual)
  const url = t.fileId
    ? `${BASE_URL}/download/tnd/ann.jwebs?id=${Buffer.from(`${Date.now()}|${t.fileId}`).toString("base64")}`
    : `${INDEX_URL}#proclist`;

  const deskripsi = [
    t.kkks  ? `KKKS: ${t.kkks}`      : "",
    t.jenis ? `Jenis: ${t.jenis}`    : "",
    t.bidang ? `Bidang: ${t.bidang}` : "",
    t.golongan ? `Golongan: ${t.golongan}` : "",
    t.tayang ? `Tayang: ${t.tayang}` : "",
    t.deskripsi,
  ].filter(Boolean).join(" | ");

  return {
    id:              `civd-${Date.now()}-${idx}`,
    sumber:          "CIVD",
    url:             t.fileId ? url : `${INDEX_URL}#proclist`,
    namaProyek:      t.judul,
    namaPerusahaan:  t.kkks || "SKK Migas / Operator Migas",
    industri:        "Migas",
    lokasi:          "Indonesia (Migas)",
    nilaiProyek:     0, // CIVD tidak menampilkan nilai estimasi
    deadline:        t.tayang,
    kebutuhan:       guessKebutuhan(t.judul, t.bidang, t.deskripsi),
    deskripsiKebutuhan: deskripsi,
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

// ─── Fetch dari File Procurement List Lokal ──────────────────────────────────

/**
 * Baca dan parse procurement list dari file text lokal
 * Untuk data procurement list yang sudah di-download/extract dari CIVD
 */
export async function fetchFromProcurementFile(
  filePath: string,
  filterIT: boolean = true
): Promise<Lead[]> {
  console.log(`[CIVD Agent] Membaca procurement list dari file: ${filePath}`);

  try {
    const absolutePath = resolve(filePath);
    const content = await readFile(absolutePath, "utf-8");

    const leads = processProcurementList(content, filterIT);
    console.log(`[CIVD Agent] Berhasil load ${leads.length} lead dari file procurement list.`);

    return leads;
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[CIVD Agent] Gagal membaca file procurement list: ${msg}`);
    return [];
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function fetchCivdSkkMigas(): Promise<Lead[]> {
  console.log(
    "[CIVD Agent] Memulai — civd.skkmigas.go.id (publik, tidak butuh login)"
  );

  const jsessionid = await getJsessionId();
  if (!jsessionid) {
    console.warn("[CIVD Agent] Tidak dapat JSESSIONID. CIVD dilewati.");
    return [];
  }

  console.log("[CIVD Agent] JSESSIONID diperoleh, mulai fetch Undangan Prakualifikasi (type=1)...");
  await sleep(DELAY_MS);

  const allTenders: CivdTender[] = [];
  const seen = new Set<string>();

  // ── type=1: Undangan Prakualifikasi (data terkaya) ────────────────────────

  const { tenders: page1, totalItems } = await fetchFirstPage(jsessionid, 1, "");
  for (const t of page1) {
    if (!seen.has(t.judul)) { seen.add(t.judul); allTenders.push(t); }
  }

  const totalPages = Math.min(MAX_PAGES, Math.ceil(totalItems / ITEMS_PAGE));
  console.log(
    `[CIVD Agent] type=1: ${totalItems} item total | ${totalPages} halaman | hal.1 → ${page1.length} card`
  );

  for (let page = 2; page <= totalPages; page++) {
    await sleep(DELAY_MS);
    const items = await fetchPage(jsessionid, 1, page, "");
    let added = 0;
    for (const t of items) {
      if (!seen.has(t.judul)) { seen.add(t.judul); allTenders.push(t); added++; }
    }
    console.log(`[CIVD Agent] hal.${page}/${totalPages} → ${added} baru | total: ${allTenders.length}`);
    if (items.length === 0) break; // halaman kosong = selesai
  }

  // ── type=3: Daftar Pengadaan/Procurement List ─────────────────────────────

  await sleep(DELAY_MS);
  const { tenders: procList } = await fetchFirstPage(jsessionid, 3, "");
  let procAdded = 0;
  for (const t of procList) {
    if (!seen.has(t.judul)) { seen.add(t.judul); allTenders.push(t); procAdded++; }
  }
  if (procAdded > 0) {
    console.log(`[CIVD Agent] type=3 (Procurement List): ${procAdded} item ditambahkan`);
  }

  // ── Filter Tanggal: Hanya bulan berjalan atau ke depan ───────────────────

  const validDateTenders = allTenders.filter((t) => isDateValid(t.tayang));
  const expiredCount = allTenders.length - validDateTenders.length;
  if (expiredCount > 0) {
    console.log(
      `[CIVD Agent] Filter tanggal: ${validDateTenders.length} valid | ` +
      `${expiredCount} bulan lampau dilewati`
    );
  }

  // ── Filter IT ─────────────────────────────────────────────────────────────

  const itLeads = validDateTenders.filter(
    (t) => isITRelevant(`${t.judul} ${t.bidang} ${t.deskripsi}`)
  );
  const nonIT = validDateTenders.length - itLeads.length;

  console.log(
    `[CIVD Agent] Filter IT: ${itLeads.length} relevan | ${nonIT} non-IT dilewati`
  );

  const leads = itLeads.map((t, i) => toLog(t, i));
  console.log(`[CIVD Agent] Selesai. ${leads.length} lead dari CIVD SKK Migas.`);
  return leads;
}
