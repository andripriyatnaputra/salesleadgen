import axios from "axios";
import { load } from "cheerio";
import type { Lead, KategoriKebutuhan } from "../../config/claude.js";
import { sleep } from "../../config/claude.js";

// ─── Konfigurasi ──────────────────────────────────────────────────────────────

const BASE_URL    = "https://eproc.bankbjb.co.id";
const API_URL     = "https://eproc.bankbjb.co.id/api/procurement-announcement/index";
const LIST_PATH   = "/portal/procurement-announcement"; // fallback

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MAX_LISTING_PAGES = 1;
const DELAY_MS          = 1500;

// ─── Filter IT ────────────────────────────────────────────────────────────────

const IT_KEYWORDS = [
  "sistem informasi", "aplikasi", "software", "jaringan", "network",
  "komputer", "server", "hardware", "teknologi informasi",
  "core banking", "internet banking", "mobile banking",
  "atm", "edc", "payment gateway",
  "dashboard", "portal", "website", "digitalisasi", "digital",
  "data center", "datacenter", "cloud", "hosting", "fiber",
  "wifi", "internet", "telekomunikasi", "cctv", "kamera",
  "perangkat keras", "perangkat lunak", "infrastruktur it",
  "pengembangan sistem", "integrasi sistem",
  "load balancer", "firewall", "switch", "router", "access point",
  "storage", "backup", "disaster recovery", "virtualisasi",
  "database", "sql", "erp", "crm", "fintech",
];

const NON_IT_EXCLUSIONS = [
  "perpipaan", "pipa", "konstruksi", "sipil", "gedung",
  "sewa lahan", "kendaraan", "alat berat", "kimia",
  "cleaning", "housekeeping", "catering", "konsumsi",
  "security guard", "satpam", "tenaga kerja bantu",
  "medical", "alat kesehatan", "obat",
  "furniture", "mebel", "alat tulis kantor", "atk",
];

function isITCandidate(title: string): boolean {
  const t = title.toLowerCase();
  if (NON_IT_EXCLUSIONS.some((x) => t.includes(x))) return false;
  return IT_KEYWORDS.some((kw) => t.includes(kw));
}

function isDateValid(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) return true;

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

interface BjbTender {
  id:       string;
  judul:    string;
  nilai:    number;
  deadline: string;
  url:      string;
  deskripsi: string;
  status:   string;
}

function parseApiResponse(data: any[]): BjbTender[] {
  const tenders: BjbTender[] = [];

  for (const item of data) {
    // Extract from BJB API response format
    const judul = item.title || "";
    // Create stable ID from title slug
    const titleSlug = judul.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
    const id = item.id ? String(item.id) : `bjb-${titleSlug}`;
    const nilai = 0; // Nilai tidak tersedia di API listing

    // Convert Unix timestamp to readable date
    let deadline = "";
    if (item.date && typeof item.date === 'number') {
      const date = new Date(item.date);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      deadline = `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    const status = item.badge || "Buka Pendaftaran";
    const department = item.department || "";
    const url = item.file ? `${BASE_URL}${item.file}` : `${BASE_URL}/portal/procurement-announcement`;

    if (judul && judul.length > 5) {
      const deskripsi = [
        judul,
        department ? `Department: ${department}` : "",
        status ? `Status: ${status}` : "",
      ].filter(Boolean).join(" | ");

      tenders.push({
        id,
        judul,
        nilai: typeof nilai === 'number' ? nilai : parseFloat(String(nilai).replace(/[^\d]/g, '')) || 0,
        deadline,
        url,
        deskripsi,
        status,
      });
    }
  }

  return tenders;
}

async function fetchListing(): Promise<BjbTender[]> {
  // Try API endpoint first
  try {
    const apiRes = await axios.get(API_URL, {
      timeout: 20_000,
      headers: {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Referer": `${BASE_URL}${LIST_PATH}`,
      },
      validateStatus: (s) => s < 500,
    });

    if (apiRes.status === 200 && apiRes.data) {
      console.log(`[BJB Agent] API endpoint response received`);

      // Try to parse JSON response
      const data = typeof apiRes.data === "string" ? JSON.parse(apiRes.data) : apiRes.data;

      if (Array.isArray(data) && data.length > 0) {
        return parseApiResponse(data);
      } else if (data.openRegistList && Array.isArray(data.openRegistList)) {
        // Tab "Buka Pendaftaran"
        console.log(`[BJB Agent] Found ${data.openRegistList.length} items in openRegistList`);
        return parseApiResponse(data.openRegistList);
      } else if (data.data && Array.isArray(data.data)) {
        return parseApiResponse(data.data);
      } else if (data.result && Array.isArray(data.result)) {
        return parseApiResponse(data.result);
      } else if (data.rows && Array.isArray(data.rows)) {
        return parseApiResponse(data.rows);
      } else {
        console.log(`[BJB Agent] API response structure: ${JSON.stringify(Object.keys(data)).slice(0, 200)}`);
      }
    }
  } catch (err) {
    console.warn(`[BJB Agent] API fetch error: ${(err as Error).message}`);
  }

  // Fallback to HTML scraping
  try {
    const url = `${BASE_URL}${LIST_PATH}`;
    const res = await axios.get<string>(url, {
      timeout: 20_000,
      headers: { "User-Agent": UA, Accept: "text/html" },
      validateStatus: (s) => s < 500,
    });

    if (res.status !== 200) {
      console.log(`[BJB Agent] HTTP ${res.status} - Website mungkin memerlukan JavaScript`);
      return [];
    }

    const $ = load(res.data);
    const tenders: BjbTender[] = [];

    // Cari tab "Buka Pendaftaran" atau data tender
    const selectors = [
      "#buka-pendaftaran .tender-item",
      ".tab-content .tender-item",
      "table tbody tr",
      ".card",
      "div[class*='tender']",
      "div[class*='paket']",
    ];

    for (const selector of selectors) {
      $(selector).each((_, el) => {
        const elem = $(el);

        // Skip jika bukan tab "Buka Pendaftaran"
        const tabContainer = elem.closest(".tab-pane");
        if (tabContainer.length > 0 && !tabContainer.attr("id")?.includes("buka")) {
          return;
        }

        // Cari judul
        const judul = elem.find("h3, h4, h5, .title, .judul, strong, td").first().text().trim() ||
                      elem.find("td").eq(1).text().trim();

        if (!judul || judul.length < 10) return;

        // Cari link detail
        const link = elem.find("a").first().attr("href") || "";
        const id = link.match(/id=(\d+)/)?.[1] ||
                   link.match(/tender[_-](\d+)/i)?.[1] ||
                   `bjb-${Date.now()}-${Math.random()}`;

        // Cari nilai
        const nilaiText = elem.text();
        const nilaiMatch = nilaiText.match(/Rp\.?\s*([\d.,]+)/i);
        const nilai = nilaiMatch ? parseFloat(nilaiMatch[1].replace(/[.,]/g, "")) : 0;

        // Cari deadline
        const deadlineMatch = elem.text().match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
        const deadline = deadlineMatch ? deadlineMatch[0] : "";

        // Status
        const status = elem.find(".badge, .status").text().trim() || "Buka Pendaftaran";

        const url = link.startsWith("http") ? link : `${BASE_URL}${link}`;

        tenders.push({
          id,
          judul,
          nilai,
          deadline,
          url,
          deskripsi: `${judul} | Status: ${status}`,
          status,
        });
      });

      if (tenders.length > 0) break;
    }

    return tenders;
  } catch (err) {
    console.warn(`[BJB Agent] Error fetching listing: ${(err as Error).message}`);
    return [];
  }
}

// ─── Mapper → Lead ────────────────────────────────────────────────────────────

function guessKebutuhan(title: string): KategoriKebutuhan {
  const t = title.toLowerCase();
  if (/jaringan|network|wifi|fiber|internet|telekomunikasi/.test(t)) return "jaringan";
  if (/server|hardware|komputer|laptop|datacenter|atm|edc/.test(t)) return "it-infrastructure";
  if (/cctv|kamera|surveillance|access control/.test(t)) return "cctv";
  if (/cloud|hosting|vps/.test(t)) return "cloud";
  if (/integrasi|api|middleware|core banking|payment/.test(t)) return "sistem-integrasi";
  return "software";
}

function toLog(t: BjbTender): Lead {
  return {
    id:              t.id,
    sumber:          "BJB",
    url:             t.url,
    namaProyek:      t.judul,
    namaPerusahaan:  "Bank Jabar Banten (BJB)",
    industri:        "Perbankan",
    lokasi:          "Jawa Barat",
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

export async function fetchBjbTenders(): Promise<Lead[]> {
  console.log("[BJB Agent] Memulai — eproc.bankbjb.co.id (Tab: Buka Pendaftaran)");

  const allTenders = await fetchListing();
  console.log(`[BJB Agent] ${allTenders.length} tender ditemukan dari listing`);

  if (allTenders.length === 0) {
    console.log("[BJB Agent] Selesai. 0 tender (mungkin issue scraping atau tidak ada tender aktif).");
    return [];
  }

  // Filter tanggal
  const validTenders = allTenders.filter(t => isDateValid(t.deadline));
  const expiredCount = allTenders.length - validTenders.length;
  if (expiredCount > 0) {
    console.log(
      `[BJB Agent] Filter tanggal: ${validTenders.length} valid | ` +
      `${expiredCount} bulan lampau dilewati`
    );
  }

  // Filter IT
  const itTenders = validTenders.filter(t => isITCandidate(t.judul));
  const nonIT = validTenders.length - itTenders.length;
  console.log(
    `[BJB Agent] Filter IT: ${itTenders.length} relevan | ${nonIT} non-IT dilewati`
  );

  const leads = itTenders.map(t => toLog(t));
  console.log(`[BJB Agent] Selesai. ${leads.length} tender IT dari Bank BJB.`);
  return leads;
}
