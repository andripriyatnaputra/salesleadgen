import axios from "axios";
import { load } from "cheerio";
import type { Lead, KategoriKebutuhan } from "../../config/claude.js";
import { sleep } from "../../config/claude.js";

// ─── Konfigurasi ──────────────────────────────────────────────────────────────

const BASE_URL    = "https://eproc.bpjsketenagakerjaan.go.id";
const LIST_PATH   = "/pengumuman-tender";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MAX_LISTING_PAGES = 1;
const DELAY_MS          = 1500;

// ─── Filter IT ────────────────────────────────────────────────────────────────

const IT_KEYWORDS = [
  "sistem informasi", "aplikasi", "software", "jaringan", "network",
  "komputer", "server", "hardware", "teknologi informasi",
  "gis", "arcgis", "scada", "monitoring sistem", "smart meter",
  "dashboard", "portal", "website", "digitalisasi", "digital",
  "data center", "datacenter", "cloud", "hosting", "fiber",
  "wifi", "internet", "telekomunikasi", "cctv", "kamera",
  "perangkat keras", "perangkat lunak", "infrastruktur it",
  "pengembangan sistem", "integrasi sistem",
  "load balancer", "firewall", "switch", "router", "access point",
  "storage", "backup", "disaster recovery", "virtualisasi",
  "database", "sql", "erp", "crm",
];

const NON_IT_EXCLUSIONS = [
  "perpipaan", "pipa", "konstruksi", "sipil", "gedung",
  "sewa lahan", "kendaraan", "alat berat", "kimia",
  "cleaning", "housekeeping", "catering", "konsumsi",
  "security guard", "satpam", "tenaga kerja bantu",
  "medical", "alat kesehatan", "obat",
];

function isITCandidate(title: string): boolean {
  const t = title.toLowerCase();
  if (NON_IT_EXCLUSIONS.some((x) => t.includes(x))) return false;
  return IT_KEYWORDS.some((kw) => t.includes(kw));
}

function isDateValid(dateStr: string): boolean {
  if (!dateStr || !dateStr.trim()) return true;

  try {
    const bulanMap: Record<string, number> = {
      januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
      juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
      jan: 0, feb: 1, mar: 2, apr: 3, jun: 5,
      jul: 6, agu: 7, sep: 8, okt: 9, nov: 10, des: 11,
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

// ─── Scrape Listing ───────────────────────────────────────────────────────────

interface BpjsTender {
  id:       string;
  judul:    string;
  nilai:    number;
  deadline: string;
  url:      string;
  deskripsi: string;
}

async function fetchListing(): Promise<BpjsTender[]> {
  try {
    const url = `${BASE_URL}${LIST_PATH}`;
    const res = await axios.get<string>(url, {
      timeout: 20_000,
      headers: { "User-Agent": UA, Accept: "text/html" },
      validateStatus: (s) => s < 500,
    });

    if (res.status !== 200) {
      console.log(`[BPJS Agent DEBUG] HTTP ${res.status}`);
      return [];
    }

    const $ = load(res.data);

    // Debug: log HTML structure
    console.log(`[BPJS Agent DEBUG] HTML length: ${res.data.length} chars`);
    console.log(`[BPJS Agent DEBUG] Title: ${$("title").text()}`);
    console.log(`[BPJS Agent DEBUG] Found divs: ${$("div").length}`);
    console.log(`[BPJS Agent DEBUG] Found tables: ${$("table").length}`);
    console.log(`[BPJS Agent DEBUG] Found links: ${$("a").length}`);

    const tenders: BpjsTender[] = [];

    // Coba berbagai selector untuk tender cards/rows
    const selectors = [
      ".tender-item",
      ".card",
      "tr[data-tender]",
      "table tbody tr",
      "div[class*='tender']",
      "div[class*='paket']",
    ];

    for (const selector of selectors) {
      $(selector).each((_, el) => {
        const elem = $(el);

        // Cari judul
        const judul = elem.find("h3, h4, h5, .title, .judul, strong").first().text().trim() ||
                      elem.find("td").eq(1).text().trim();

        if (!judul || judul.length < 10) return;

        // Cari link detail
        const link = elem.find("a").first().attr("href") || "";
        const id = link.match(/id=(\d+)/)?.[1] ||
                   link.match(/paket[_-](\d+)/i)?.[1] ||
                   `bpjs-${Date.now()}-${Math.random()}`;

        // Cari nilai
        const nilaiText = elem.text();
        const nilaiMatch = nilaiText.match(/Rp\.?\s*([\d.,]+)/i);
        const nilai = nilaiMatch ? parseFloat(nilaiMatch[1].replace(/[.,]/g, "")) : 0;

        // Cari deadline
        const deadlineMatch = elem.text().match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
        const deadline = deadlineMatch ? deadlineMatch[0] : "";

        const url = link.startsWith("http") ? link : `${BASE_URL}${link}`;

        tenders.push({
          id,
          judul,
          nilai,
          deadline,
          url,
          deskripsi: judul,
        });
      });

      if (tenders.length > 0) break;
    }

    return tenders;
  } catch (err) {
    console.warn(`[BPJS Agent] Error fetching listing: ${(err as Error).message}`);
    return [];
  }
}

// ─── Mapper → Lead ────────────────────────────────────────────────────────────

function guessKebutuhan(title: string): KategoriKebutuhan {
  const t = title.toLowerCase();
  if (/jaringan|network|wifi|fiber|internet|telekomunikasi/.test(t)) return "jaringan";
  if (/server|hardware|komputer|laptop|datacenter/.test(t)) return "it-infrastructure";
  if (/cctv|kamera|surveillance|access control/.test(t)) return "cctv";
  if (/cloud|hosting|vps/.test(t)) return "cloud";
  if (/integrasi|api|middleware|scada/.test(t)) return "sistem-integrasi";
  return "software";
}

function toLog(t: BpjsTender): Lead {
  return {
    id:              t.id,
    sumber:          "PENGADAAN",
    url:             t.url,
    namaProyek:      t.judul,
    namaPerusahaan:  "BPJS Ketenagakerjaan",
    industri:        "BUMN",
    lokasi:          "Indonesia",
    nilaiProyek:     t.nilai,
    deadline:        t.deadline,
    kebutuhan:       guessKebutuhan(t.judul),
    deskripsiKebutuhan: t.deskripsi,
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

export async function fetchBpjsTenders(): Promise<Lead[]> {
  console.log("[BPJS Agent] Memulai — eproc.bpjsketenagakerjaan.go.id");

  const allTenders = await fetchListing();
  console.log(`[BPJS Agent] ${allTenders.length} tender ditemukan dari listing`);

  if (allTenders.length === 0) {
    console.log("[BPJS Agent] Selesai. 0 tender (mungkin issue scraping atau tidak ada tender aktif).");
    return [];
  }

  // Filter tanggal
  const validTenders = allTenders.filter(t => isDateValid(t.deadline));
  const expiredCount = allTenders.length - validTenders.length;
  if (expiredCount > 0) {
    console.log(
      `[BPJS Agent] Filter tanggal: ${validTenders.length} valid | ` +
      `${expiredCount} bulan lampau dilewati`
    );
  }

  // Filter IT
  const itTenders = validTenders.filter(t => isITCandidate(t.judul));
  const nonIT = validTenders.length - itTenders.length;
  console.log(
    `[BPJS Agent] Filter IT: ${itTenders.length} relevan | ${nonIT} non-IT dilewati`
  );

  const leads = itTenders.map(t => toLog(t));
  console.log(`[BPJS Agent] Selesai. ${leads.length} tender IT dari BPJS Ketenagakerjaan.`);
  return leads;
}
