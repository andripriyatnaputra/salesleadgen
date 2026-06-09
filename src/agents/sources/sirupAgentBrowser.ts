// src/agents/sources/sirupAgentBrowser.ts
// SIRUP Agent using Puppeteer (headless browser) for reliable scraping
// Alternative to API-based scraping when DataTables AJAX endpoint returns empty

import puppeteer, { Browser, Page } from "puppeteer";
import type { Lead, KategoriKebutuhan, IndustriICP } from "../../config/claude.js";
import { sleep, SCRAPE_DELAY_MS } from "../../config/claude.js";

// ─── Konfigurasi ──────────────────────────────────────────────────────────────

const BASE_URL = "https://sirup.inaproc.id";
const INDEX_URL = `${BASE_URL}/sirup/caripaketctr/index`;
const TAHUN = new Date().getFullYear();

// Keywords fokus ke yang memiliki banyak hasil
const KEYWORDS_IT = [
  "Belanja Alat/Bahan",  // Banyak hasil di halaman 1
  "jaringan komputer",
  "teknologi informasi",
  "software",
  "server",
  "CCTV",
];

const NILAI_MINIMUM = 100_000_000; // Rp 100 juta
const MAX_RESULTS_PER_KEYWORD = 50; // Limit results per keyword

// ─── Interface ────────────────────────────────────────────────────────────────

export interface SirupPackage {
  namaPaket: string;
  satkerNama: string;
  klpdNama: string;
  pagu: number;
  tahunAnggaran: string;
  metodePengadaan: string;
  urlDetail: string;
  tanggalAmbil: string;
}

interface TableRow {
  namaPaket: string;
  satker: string;
  pagu: string;
  metode: string;
  tahun: string;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function isRelevant(namaPaket: string): boolean {
  const lower = namaPaket.toLowerCase();
  const keywords = [
    "jaringan", "internet", "broadband", "wifi", "fiber",
    "server", "data center", "cloud", "hosting",
    "software", "aplikasi", "sistem informasi", "website",
    "IT", "teknologi informasi", "komputer", "laptop",
    "CCTV", "keamanan siber", "cybersecurity",
    "telekomunikasi", "WAN", "LAN", "VPN",
  ];
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function parseNilai(str: string): number {
  const clean = str.replace(/[^0-9]/g, "");
  return clean ? parseInt(clean, 10) : 0;
}

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

// ─── Puppeteer Scraper ────────────────────────────────────────────────────────

async function scrapeWithBrowser(keyword: string): Promise<SirupPackage[]> {
  console.log(`[SIRUP Browser] Keyword: "${keyword}"`);

  let browser: Browser | null = null;
  const packages: SirupPackage[] = [];

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page: Page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Navigate to SIRUP
    await page.goto(INDEX_URL, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for DataTables search input
    await page.waitForSelector('input[type="search"]', { timeout: 10000 });

    // Clear existing search and type new keyword
    const searchInput = await page.$('input[type="search"]');
    if (searchInput) {
      // Triple click to select all
      await searchInput.click();
      await searchInput.click();
      await searchInput.click();
      await searchInput.type(keyword, { delay: 100 });
    }

    // Wait for DataTables to process search
    await sleep(3000);

    // Wait for table rows to appear
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Extract data from table
    // @ts-ignore - Code runs in browser context where document is available
    const rows: TableRow[] = await page.evaluate(() => {
      // @ts-ignore
      const tableRows = document.querySelectorAll('table tbody tr');
      const data: any[] = [];

      // @ts-ignore
      tableRows.forEach((row: any) => {
        const cells = row.querySelectorAll('td');

        // Skip "No data available" or empty rows
        if (cells.length < 10 || row.textContent?.includes('No data available')) {
          return;
        }

        // Extract text from cells
        // SIRUP table columns (verified from screenshot):
        // [0]=No, [1]=Paket, [2]=Pagu(Rp), [3]=Jenis Pengadaan, [4]=Produk Dalam Negeri,
        // [5]=Usaha Kecil/Koperasi, [6]=Metode, [7]=Pemilihan, [8]=K/L/PD,
        // [9]=Satuan Kerja, [10]=Lokasi, [11]=ID
        const cellTexts = Array.from(cells).map((c: any) => c.textContent?.trim() || '');

        data.push({
          namaPaket: cellTexts[1] || '',
          satker: cellTexts[9] || '',
          pagu: cellTexts[2] || '',
          metode: cellTexts[6] || '',
          tahun: '2026',
        });
      });

      return data;
    });

    console.log(`[SIRUP Browser] Found ${rows.length} rows in table`);

    // Process rows into packages
    for (const row of rows.slice(0, MAX_RESULTS_PER_KEYWORD)) {
      if (!row.namaPaket) continue;

      // Filter IT-relevant only for non "Belanja Alat/Bahan" keywords
      if (!keyword.includes('Belanja') && !isRelevant(row.namaPaket)) continue;

      const pagu = parseNilai(row.pagu);
      if (pagu > 0 && pagu < NILAI_MINIMUM) continue;

      packages.push({
        namaPaket: row.namaPaket,
        satkerNama: row.satker,
        klpdNama: row.satker,
        pagu,
        tahunAnggaran: row.tahun || String(TAHUN),
        metodePengadaan: row.metode || "Belum Ditentukan",
        urlDetail: `${BASE_URL}/sirup/caripaketctr/index`,
        tanggalAmbil: new Date().toISOString(),
      });
    }

    console.log(`[SIRUP Browser] Filtered to ${packages.length} relevant packages`);

  } catch (error) {
    const err = error as Error;
    console.log(`[SIRUP Browser] Error for "${keyword}": ${err.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return packages;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function runSirupBrowserAgent(): Promise<SirupPackage[]> {
  console.log(`[SIRUP Browser Agent] Mulai — ${BASE_URL} | ${KEYWORDS_IT.length} keywords`);
  console.log(`[SIRUP Browser Agent] Method: Puppeteer (headless browser)`);

  const allPackages: SirupPackage[] = [];
  const seen = new Set<string>();

  for (const keyword of KEYWORDS_IT) {
    const packages = await scrapeWithBrowser(keyword);

    for (const pkg of packages) {
      const key = pkg.namaPaket + "|" + pkg.satkerNama;
      if (!seen.has(key)) {
        seen.add(key);
        allPackages.push(pkg);
      }
    }

    // Rate limiting between keywords
    await sleep(SCRAPE_DELAY_MS);
  }

  console.log(`[SIRUP Browser Agent] Selesai. Total unik: ${allPackages.length} paket`);
  return allPackages;
}

// ─── Mapper to Lead ───────────────────────────────────────────────────────────

function sirupPackageToLead(pkg: SirupPackage, index: number): Lead {
  const instansi = pkg.klpdNama || pkg.satkerNama || "Instansi Pemerintah";

  return {
    id: `sirup-${index}-${pkg.namaPaket.slice(0, 20).replace(/\s+/g, "-")}`,
    sumber: "LPSE", // SIRUP adalah bagian dari sistem LPSE
    url: pkg.urlDetail,
    namaProyek: pkg.namaPaket,
    namaPerusahaan: instansi,
    industri: guessIndustri(instansi),
    lokasi: extractLokasi(instansi),
    nilaiProyek: pkg.pagu,
    deadline: "",
    kebutuhan: guessKebutuhan(pkg.namaPaket),
    deskripsiKebutuhan:
      `[SIRUP ${pkg.tahunAnggaran}] ${pkg.metodePengadaan}: ${pkg.namaPaket} | ` +
      `Satker: ${pkg.satkerNama || "N/A"}`,
    pic: { nama: "", jabatan: "Pejabat Pengadaan", email: "", telepon: "" },
    score: 0,
    prioritas: "rendah",
    alasanScore: "",
    tanggalDitemukan: pkg.tanggalAmbil,
  };
}

export async function fetchSirupPackagesBrowser(): Promise<Lead[]> {
  const packages = await runSirupBrowserAgent();
  return packages.map((pkg, i) => sirupPackageToLead(pkg, i));
}
