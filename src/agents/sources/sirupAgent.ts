// src/agents/sources/sirupAgent.ts
import axios from "axios";
import type { Lead, KategoriKebutuhan, IndustriICP } from "../../config/claude.js";
import { sleep, SCRAPE_DELAY_MS } from "../../config/claude.js";

// ─── Konfigurasi ──────────────────────────────────────────────────────────────

// VERIFIED: sirup.inaproc.id adalah endpoint yang benar dan bisa diakses publik
// sirup.lkpp.go.id TIDAK bisa di-resolve (DNS fail)
const BASE_URL = "https://sirup.inaproc.id";
const SEARCH_ENDPOINT = "/sirup/caripaketctr/search"; // DataTables AJAX endpoint
const TAHUN = new Date().getFullYear();

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Keywords untuk pencarian SIRUP
const KEYWORDS_IT = [
  "jaringan komputer",
  "teknologi informasi",
  "sistem informasi",
  "software",
  "aplikasi",
  "server",
  "internet",
  "telekomunikasi",
  "fiber optik",
  "CCTV",
  "cloud",
  "cybersecurity",
  "infrastruktur IT",
  "hardware komputer",
];

const NILAI_MINIMUM = 100_000_000; // Rp 100 juta
const MAX_PAGES = 3;

// ─── Interface Internal ──────────────────────────────────────────────────────

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

// ─── Helper ───────────────────────────────────────────────────────────────────

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

// ─── Session Cookie Management ────────────────────────────────────────────────
// SIRUP DataTables endpoint memerlukan session cookie dari halaman index

let sessionCookie: string | null = null;

async function getSessionCookie(): Promise<string> {
  if (sessionCookie) return sessionCookie;

  try {
    const res = await axios.get(`${BASE_URL}/sirup/caripaketctr/index`, {
      timeout: 15_000,
      headers: { "User-Agent": UA },
      maxRedirects: 5,
    });

    const setCookies = res.headers["set-cookie"];
    if (!Array.isArray(setCookies) || setCookies.length === 0) {
      console.log(`[SIRUP Agent] No session cookie received`);
      return "";
    }

    // Ambil PLAY_SESSION cookie (yang paling penting untuk SIRUP)
    const playSession = setCookies.find(c => c.startsWith("PLAY_SESSION="));
    if (playSession) {
      sessionCookie = playSession.split(";")[0] ?? "";
      console.log(`[SIRUP Agent] Got session cookie: ${sessionCookie.substring(0, 50)}...`);
      return sessionCookie;
    }

    return "";
  } catch (err) {
    console.log(`[SIRUP Agent] Failed to get session cookie: ${err}`);
    return "";
  }
}

// ─── Scraper SIRUP ───────────────────────────────────────────────────────────

interface SirupApiResponse {
  data?: SirupApiItem[];
  aaData?: SirupApiItem[];
}

interface SirupApiItem {
  // Nama paket variations
  namaPaket?: string;
  nama_paket?: string;

  // Satker/KLPD variations
  namaKlpd?: string;
  klpd_nama?: string;
  nama_klpd?: string;
  satkerNama?: string;
  satker_nama?: string;
  satker?: string;

  // Pagu variations
  paguPaket?: number | string;
  pagu?: number | string;
  nilai_pagu?: number | string;
  pagu_paket?: number | string;

  // Metode variations
  metodePengadaan?: string;
  metode_pengadaan?: string;
  metode?: string;

  // Tahun variations
  tahunAnggaran?: string | number;
  tahun_anggaran?: string | number;
  tahun?: string | number;

  // ID/Kode variations
  kd_paket?: string;
  kdPaket?: string;
  id?: string;
}

async function scrapeSIRUP(keyword: string, page: number = 1): Promise<SirupPackage[]> {
  const packages: SirupPackage[] = [];

  try {
    // Get session cookie first
    const cookie = await getSessionCookie();

    // DataTables AJAX GET request dengan semua parameter yang diperlukan
    const start = (page - 1) * 50;
    const url = `${BASE_URL}${SEARCH_ENDPOINT}` +
      `?tahunAnggaran=${TAHUN}` +
      `&jenisPengadaan=` +      // empty = all types
      `&metodePengadaan=` +     // empty = all methods
      `&minPagu=` +             // empty = no minimum
      `&maxPagu=` +             // empty = no maximum
      `&bulan=` +               // empty = all months
      `&lokasi=` +              // empty = all locations
      `&kldi=` +                // empty
      `&pdn=` +                 // empty
      `&ukm=` +                 // empty
      `&draw=1` +
      `&start=${start}` +
      `&length=50` +
      `&search%5Bvalue%5D=${encodeURIComponent(keyword)}` +  // search[value]=keyword
      `&search%5Bregex%5D=false`;                            // search[regex]=false

    const res = await axios.get<SirupApiResponse>(url, {
      timeout: 20_000,
      headers: {
        "User-Agent": UA,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": `${BASE_URL}/sirup/caripaketctr/index`,
        ...(cookie ? { "Cookie": cookie } : {}),
      },
    });

    // Debug logging (temporary)
    if (page === 1) {
      console.log(`[SIRUP Agent DEBUG] Response status: ${res.status}`);
      console.log(`[SIRUP Agent DEBUG] Content-Type: ${res.headers['content-type']}`);
      console.log(`[SIRUP Agent DEBUG] Response type: ${typeof res.data}`);
      console.log(`[SIRUP Agent DEBUG] Response data: ${JSON.stringify(res.data).substring(0, 200)}`);
      console.log(`[SIRUP Agent DEBUG] recordsTotal: ${(res.data as any)?.recordsTotal ?? 'N/A'}`);
    }

    // Handle berbagai format response dari DataTables
    const items = res.data?.data ?? res.data?.aaData ?? [];

    for (const item of items) {
      // DataTables bisa return array of arrays atau array of objects
      // Coba parse sebagai object dulu, fallback ke array
      let namaPaket = "";
      let satkerNama = "";
      let klpdNama = "";
      let pagu = 0;
      let metodePengadaan = "Belum Ditentukan";
      let tahunAnggaran = String(TAHUN);
      let kdPaket = "";

      if (typeof item === 'object' && !Array.isArray(item)) {
        // Object format
        namaPaket = item.namaPaket ?? item.nama_paket ?? "";
        satkerNama = item.satker_nama ?? item.satker ?? item.satkerNama ?? "";
        klpdNama = item.namaKlpd ?? item.klpd_nama ?? item.nama_klpd ?? "";

        const paguRaw = item.paguPaket ?? item.pagu ?? item.nilai_pagu ?? item.pagu_paket ?? 0;
        pagu = typeof paguRaw === 'number' ? paguRaw : parseFloat(String(paguRaw).replace(/[^0-9]/g, '') || '0');

        metodePengadaan = item.metodePengadaan ?? item.metode_pengadaan ?? item.metode ?? "Belum Ditentukan";
        tahunAnggaran = String(item.tahunAnggaran ?? item.tahun_anggaran ?? item.tahun ?? TAHUN);
        kdPaket = item.kd_paket ?? item.kdPaket ?? item.id ?? "";
      } else if (Array.isArray(item) && item.length >= 3) {
        // Array format (common in DataTables)
        // Typical order: [0]=nama, [1]=satker, [2]=pagu, [3]=metode, etc
        namaPaket = String(item[0] ?? "");
        satkerNama = String(item[1] ?? "");
        pagu = parseFloat(String(item[2] ?? "0").replace(/[^0-9]/g, '') || '0');
        metodePengadaan = String(item[3] ?? "Belum Ditentukan");
      }

      if (!namaPaket || !isRelevant(namaPaket)) continue;
      if (pagu > 0 && pagu < NILAI_MINIMUM) continue;

      packages.push({
        namaPaket,
        satkerNama,
        klpdNama: klpdNama || satkerNama,
        pagu,
        tahunAnggaran,
        metodePengadaan,
        urlDetail: kdPaket ? `${BASE_URL}/sirup/ro/paket/${kdPaket}` : `${BASE_URL}/sirup/caripaketctr/index`,
        tanggalAmbil: new Date().toISOString(),
      });
    }

    console.log(`[SIRUP Agent] "${keyword}" hal.${page} → ${packages.length} paket`);

  } catch (err: unknown) {
    const code = (err as { response?: { status?: number } }).response?.status;
    const msg = err instanceof Error ? err.message : String(err);

    if (code === 403) {
      console.log(`[SIRUP Agent] ✗ "${keyword}" 403 (akses ditolak) → mungkin perlu CAPTCHA atau IP blocking`);
    } else if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
      console.log(`[SIRUP Agent] ✗ DNS gagal resolve "${BASE_URL}" — normal di WSL/sandbox`);
    } else {
      console.log(`[SIRUP Agent] ✗ "${keyword}": HTTP ${code ?? "—"} ${msg}`);
    }
  }

  return packages;
}

// Note: sirup.lkpp.go.id API endpoint sudah stabil, HTML fallback tidak diperlukan
// Jika API gagal, lebih baik skip daripada scrape HTML (lebih kompleks & tidak stabil)

// ─── Mapper: SirupPackage → Lead ─────────────────────────────────────────────

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

// ─── Entry Point Internal ─────────────────────────────────────────────────────

export async function runSirupAgent(): Promise<SirupPackage[]> {
  console.log(`[SIRUP Agent] Mulai — ${BASE_URL} | ${KEYWORDS_IT.length} keywords`);
  const allPackages: SirupPackage[] = [];
  const seen = new Set<string>();

  const add = (packages: SirupPackage[]) => {
    for (const pkg of packages) {
      const key = pkg.namaPaket + "|" + (pkg.klpdNama || pkg.satkerNama);
      if (!seen.has(key)) {
        seen.add(key);
        allPackages.push(pkg);
      }
    }
  };

  // Scrape per keyword dengan pagination
  for (const keyword of KEYWORDS_IT) {
    console.log(`[SIRUP Agent] Keyword: "${keyword}"`);

    for (let page = 1; page <= MAX_PAGES; page++) {
      const packages = await scrapeSIRUP(keyword, page);
      add(packages);

      // Stop jika tidak ada hasil
      if (packages.length === 0) break;

      await sleep(SCRAPE_DELAY_MS);
    }

    await sleep(SCRAPE_DELAY_MS);
  }

  console.log(`[SIRUP Agent] Selesai. Total unik: ${allPackages.length} paket`);
  return allPackages;
}

// ─── Entry Point Pipeline ─────────────────────────────────────────────────────
// Dipanggil oleh index.ts — konversi SirupPackage[] → Lead[] langsung.

export async function fetchSirupPackages(): Promise<Lead[]> {
  const packages = await runSirupAgent();
  return packages.map((pkg, i) => sirupPackageToLead(pkg, i));
}
