import axios from "axios";
import { load } from "cheerio";
import type { Lead, KategoriKebutuhan } from "../../config/claude.js";
import { sleep } from "../../config/claude.js";

// ─── Konfigurasi ──────────────────────────────────────────────────────────────

const BASE_URL    = "https://eproc.pamjaya.co.id";
const LIST_PATH   = "/main/index/tender";
const DETAIL_PATH = "/main/index/paket_detil/";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 1 halaman listing (tender aktif biasanya hanya di page 1)
const MAX_LISTING_PAGES = 1;
const DELAY_MS          = 1500;

// ─── Filter IT ────────────────────────────────────────────────────────────────

const IT_KEYWORDS = [
  "sistem informasi", "aplikasi", "software", "jaringan", "network",
  "komputer", "server", "hardware", "teknologi informasi",
  "gis", "arcgis", "scada", "monitoring sistem", "amr", "smart meter",
  "dashboard", "portal", "website", "digitalisasi", "digital",
  "data center", "datacenter", "cloud", "hosting", "fiber",
  "wifi", "internet", "telekomunikasi", "cctv", "kamera pengawas",
  "perangkat keras", "perangkat lunak", "infrastruktur it",
  "pengembangan sistem", "integrasi sistem",
  "load balancer", "firewall", "switch", "router", "access point",
  "storage", "backup", "disaster recovery", "virtualisasi",
  "database", "sql", "erp", "crm",
];

const NON_IT_EXCLUSIONS = [
  "perpipaan", "jaringan pipa", "pipa transmisi", "pipa distribusi",
  "pompa air", "pompa sentrifugal", "pekerjaan konstruksi jalan",
  "sipil bangunan", "gedung kantor", "sewa lahan", "sewa tanah",
  "kendaraan operasional", "alat berat", "kimia koagulan",
  "water meter nd",
  "reconnection permanent",
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

// ─── Scrape Halaman Listing ───────────────────────────────────────────────────

interface ListingItem {
  reqId: number;
  title: string;
}

async function fetchListingPage(pageNum: number): Promise<ListingItem[]> {
  // CodeIgniter biasanya pakai URL segment sebagai offset: /tender/{offset}
  // offset = (page - 1) * 5
  const offset   = (pageNum - 1) * 5;
  const candidates = [
    pageNum === 1
      ? `${BASE_URL}${LIST_PATH}`
      : `${BASE_URL}${LIST_PATH}/${offset}`,          // CodeIgniter segment
    `${BASE_URL}${LIST_PATH}?page=${pageNum}`,         // query param fallback
    `${BASE_URL}${LIST_PATH}/page/${pageNum}`,         // Laravel-style fallback
  ];

  for (const url of candidates) {
    try {
      const res = await axios.get<string>(url, {
        timeout: 15_000,
        headers: { "User-Agent": UA, Accept: "text/html" },
        validateStatus: (s) => s < 500,
      });

      if (res.status !== 200) continue;

      const $ = load(res.data);
      const items: ListingItem[] = [];

      // Coba berbagai selector
      const selectors = [
        'a[href*="paket_detil"]',
        'a[href*="reqId"]',
        'a[onclick*="paket_detil"]',
        'tr td a',  // Link di dalam tabel
      ];

      for (const selector of selectors) {
        $(selector).each((_, el) => {
          const href = $(el).attr("href") || $(el).attr("onclick") || "";
          const match = href.match(/reqId=(\d+)/i);
          if (!match) return;

          const reqId = parseInt(match[1], 10);

          // Coba ambil title dari berbagai sumber
          let title = $(el).text().trim();
          if (!title || title.length < 5) {
            title = $(el).find("strong, b").text().trim();
          }
          if (!title || title.length < 5) {
            // Cek parent row untuk tabel
            title = $(el).closest("tr").find("td").first().text().trim();
          }
          if (!title || title.length < 5) {
            title = $(el).attr("title") || "";
          }

          if (reqId && title && title.length > 5) {
            // Cek apakah sudah ada di items (deduplikasi lokal)
            if (!items.some(item => item.reqId === reqId)) {
              items.push({ reqId, title: title.slice(0, 150) });
            }
          }
        });
      }

      if (items.length > 0) {
        const reqIds = items.map(i => i.reqId).join(", ");
        console.log(
          `[PAM Jaya Agent] Listing hal.${pageNum} (${url}) → ${items.length} item (reqId: ${reqIds})`
        );
        return items;
      }

      // Halaman ada tapi tidak ada link detail — mungkin halaman kosong/akhir
      if (pageNum > 1) break;

    } catch { /* coba URL berikutnya */ }
  }

  return [];
}

// ─── Scrape Detail Page ───────────────────────────────────────────────────────

function extractField($: ReturnType<typeof load>, label: string): string {
  const target = label.toLowerCase();
  let found = "";

  $("p").each((_, el) => {
    const text = ($ as ReturnType<typeof load>)(el).text().trim();
    if (text.toLowerCase().startsWith(target)) {
      found = text.slice(label.length).replace(/^[:\s]+/, "").trim();
      return false;
    }
  });
  if (found) return found;

  $("tr").each((_, row) => {
    const cells = ($ as ReturnType<typeof load>)(row).find("td");
    if (cells.length >= 2) {
      const key = cells.eq(0).text().trim().toLowerCase().replace(":", "");
      if (key === target || key.startsWith(target)) {
        found = cells.eq(1).text().trim();
        return false;
      }
    }
  });

  return found;
}

interface PamJayaTender {
  reqId:    number;
  judul:    string;
  noPaket:  string;
  nilai:    number;
  deadline: string;
  metode:   string;
  jenis:    string;
  tahap:    string;
  url:      string;
  deskripsi: string;
}

async function fetchDetail(item: ListingItem): Promise<PamJayaTender | null> {
  const url = `${BASE_URL}${DETAIL_PATH}?reqId=${item.reqId}`;
  try {
    const res = await axios.get<string>(url, {
      timeout: 15_000,
      headers: { "User-Agent": UA, Accept: "text/html", Referer: `${BASE_URL}${LIST_PATH}` },
      validateStatus: (s) => s < 500,
    });

    if (res.status === 404 || !res.data || res.data.length < 200) return null;
    if (/page not found|404/i.test(res.data)) return null;

    const $ = load(res.data);

    // Coba berbagai selector untuk judul paket
    let title = "";

    // 1. Cari di tabel dengan label "Nama Paket" atau "Judul"
    $("tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length >= 2) {
        const label = cells.eq(0).text().trim().toLowerCase();
        if (label.includes("nama paket") || label.includes("judul paket") || label === "paket") {
          const value = cells.eq(1).text().trim();
          if (value && value.length > 10 && !value.toLowerCase().includes("e-proc")) {
            title = value;
            return false;
          }
        }
      }
    });

    // 2. Cari strong/bold text yang panjang (bukan header site)
    if (!title) {
      $("strong, b").each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 20 && !text.toLowerCase().includes("e-proc") && !text.toLowerCase().includes("pam jaya")) {
          title = text;
          return false;
        }
      });
    }

    // 3. Fallback ke judul dari listing (paling reliable)
    if (!title || title.length < 20 || /minimal|syarat|ketentuan/i.test(title)) {
      title = item.title;
    }

    if (!title) return null;

    // Jika judul masih aneh, skip detail page ini
    if (title.toLowerCase().includes("e-proc") || title.length < 10) {
      console.log(`[PAM Jaya Agent] ⚠️ reqId=${item.reqId} skip - judul tidak valid: "${title}"`);
      // Gunakan data dari listing saja
      return {
        reqId: item.reqId,
        judul: item.title,
        noPaket: "",
        nilai: 0,
        deadline: "",
        metode: "",
        jenis: "",
        tahap: "",
        url,
        deskripsi: item.title,
      };
    }

    const hargaRaw  = extractField($, "Harga Perkiraan") ||
                      extractField($, "Pagu") ||
                      extractField($, "HPS") ||
                      $("p").filter((_, el) => /IDR|Rp/i.test($(el).text())).first().text();
    const noPaket   = extractField($, "No. Paket") || extractField($, "No Paket");
    const metode    = extractField($, "Metode Pengadaan");
    const jenis     = extractField($, "Jenis Pengadaan");
    const tahap     = extractField($, "Tahap") || extractField($, "Status");

    let deadline = "";
    $("p, td").each((_, el) => {
      const text = $(el).text().trim();
      if (/\d{2}\s+\w+\s+\d{4}/.test(text) && /wib|penutupan|akhir|deadline/i.test(text)) {
        const match = text.match(/(\d{2}\s+\w+\s+\d{4})/);
        if (match) { deadline = match[1]; return false; }
      }
    });

    const nilaiClean = hargaRaw.replace(/[^\d]/g, "");

    const deskripsi = [
      noPaket ? `No. Paket: ${noPaket}` : "",
      metode   ? `Metode: ${metode}`    : "",
      jenis    ? `Jenis: ${jenis}`      : "",
      tahap    ? `Tahap: ${tahap}`      : "",
      title,
    ].filter(Boolean).join(" | ");

    return {
      reqId:   item.reqId,
      judul:   title,
      noPaket,
      nilai:   nilaiClean ? parseInt(nilaiClean, 10) : 0,
      deadline,
      metode,
      jenis,
      tahap,
      url,
      deskripsi,
    };
  } catch (err) {
    console.warn(`[PAM Jaya Agent] reqId=${item.reqId}: ${(err as Error).message}`);
    return null;
  }
}

// ─── Mapper → Lead ────────────────────────────────────────────────────────────

function guessKebutuhan(title: string, deskripsi: string): KategoriKebutuhan {
  const t = `${title} ${deskripsi}`.toLowerCase();
  if (/arcgis|gis|peta|spasial/.test(t))                                        return "software";
  if (/scada|monitoring sistem|iot|smart meter|amr/.test(t))                    return "sistem-integrasi";
  if (/jaringan|network|wifi|fiber|internet|telekomunikasi/.test(t))            return "jaringan";
  if (/server|hardware|komputer|laptop|datacenter|perangkat keras/.test(t))     return "it-infrastructure";
  if (/cctv|kamera|surveillance|access control/.test(t))                        return "cctv";
  if (/cloud|hosting|vps/.test(t))                                              return "cloud";
  if (/integrasi|api|middleware/.test(t))                                       return "sistem-integrasi";
  return "software";
}

function toLog(t: PamJayaTender): Lead {
  return {
    id:              `pamjaya-${t.reqId}`,
    sumber:          "PAM_JAYA",
    url:             t.url,
    namaProyek:      t.judul,
    namaPerusahaan:  "PAM Jaya (PDAM DKI Jakarta)",
    industri:        "Pemerintah",
    lokasi:          "DKI Jakarta",
    nilaiProyek:     t.nilai,
    deadline:        t.deadline,
    kebutuhan:       guessKebutuhan(t.judul, t.deskripsi),
    deskripsiKebutuhan: t.deskripsi,
    pic: {
      nama:    "",
      jabatan: "Panitia Pengadaan PAM Jaya",
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

export async function fetchPamJayaTenders(): Promise<Lead[]> {
  console.log(
    `[PAM Jaya Agent] Memulai — eproc.pamjaya.co.id (${MAX_LISTING_PAGES} halaman listing)`
  );

  // Kumpulkan reqId dari listing, deduplikasi
  const seen      = new Set<number>();
  const candidates: ListingItem[] = [];

  for (let page = 1; page <= MAX_LISTING_PAGES; page++) {
    const items = await fetchListingPage(page);
    for (const item of items) {
      if (!seen.has(item.reqId)) {
        seen.add(item.reqId);
        candidates.push(item);
      }
    }
    if (items.length === 0) break; // tidak ada data lagi
    if (page < MAX_LISTING_PAGES) await sleep(DELAY_MS);
  }

  console.log(`[PAM Jaya Agent] ${candidates.length} kandidat ditemukan dari listing`);

  // Filter IT sebelum fetch detail (hemat request)
  const itCandidates = candidates.filter((c) => isITCandidate(c.title));
  const nonIT        = candidates.length - itCandidates.length;
  console.log(
    `[PAM Jaya Agent] Filter IT: ${itCandidates.length} relevan | ${nonIT} dilewati`
  );

  // Fetch detail hanya untuk yang IT-relevan
  const allTenders: PamJayaTender[] = [];
  for (let i = 0; i < itCandidates.length; i++) {
    const item    = itCandidates[i]!;
    const tender  = await fetchDetail(item);
    if (tender) {
      allTenders.push(tender);
      console.log(
        `[PAM Jaya Agent] [${i + 1}/${itCandidates.length}] ✓ ` +
        `"${tender.judul.slice(0, 55)}" | Rp ${tender.nilai.toLocaleString("id-ID")}`
      );
    }
    if (i < itCandidates.length - 1) await sleep(DELAY_MS);
  }

  // Filter tanggal: hanya bulan berjalan atau ke depan
  const validTenders = allTenders.filter(t => isDateValid(t.deadline));
  const expiredCount = allTenders.length - validTenders.length;
  if (expiredCount > 0) {
    console.log(
      `[PAM Jaya Agent] Filter tanggal: ${validTenders.length} valid | ` +
      `${expiredCount} bulan lampau dilewati`
    );
  }

  const leads = validTenders.map(t => toLog(t));
  console.log(`[PAM Jaya Agent] Selesai. ${leads.length} tender IT dari PAM Jaya.`);
  return leads;
}
