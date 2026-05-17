import type { Lead, IndustriICP, PrioritasLead } from "../config/claude.js";
import { LEAD_SCORE_MIN } from "../config/claude.js";

// ─── Tipe Output ──────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  industri:    { nilai: number; maks: 30; label: string };
  lokasi:      { nilai: number; maks: 35; label: string };
  nilaiProyek: { nilai: number; maks: 20; label: string };
  timing:      { nilai: number; maks: 15; label: string };
  total:       number;
}

export interface QualifiedLead extends Lead {
  isQualified:    boolean;
  scoreBreakdown: ScoreBreakdown;
}

// ─── Tabel Skor: Industri (30 poin) ──────────────────────────────────────────
// Urutan prioritas diambil dari CLAUDE.md: Migas dan Pertambangan tertinggi
// karena proyek besar, lokasi remote, dan kebutuhan infrastruktur IT tinggi.

const SKOR_INDUSTRI: Record<IndustriICP, number> = {
  Migas:          30, // proyek besar, lokasi remote, kebutuhan infra kritis
  Pertambangan:   30, // idem, kawasan terpencil
  BUMN:           26, // budget besar, procurement terstruktur
  Perbankan:      24, // kebutuhan IT tinggi, siklus belanja rutin
  Pemerintah:     20, // volume besar, proses LPSE
  Manufaktur:     18, // kawasan industri, kebutuhan jaringan & CCTV
  Kesehatan:      16, // SIMRS, jaringan antar-faskes
  Pendidikan:     12, // volume ada, nilai per proyek cenderung kecil
  Lainnya:         4, // di luar ICP
};

// ─── Tabel Skor: Lokasi (35 poin) ────────────────────────────────────────────
// Prioritas CLAUDE.md: remote/terpencil > luar Jawa > kawasan industri.
// Kompetisi lebih rendah di luar Jawa dan Starcom punya kapabilitas deploy remote.

type TierLokasi = "sangat-remote" | "luar-jawa" | "jawa" | "unknown";

const SKOR_LOKASI: Record<TierLokasi, number> = {
  "sangat-remote": 35, // Papua, Maluku, Kaltara, Sulawesi Tengah/Utara/Barat
  "luar-jawa":     26, // Sumatra, Kalimantan, Sulsel, Bali, NTB, NTT
  "jawa":          10, // DKI, Jabar, Jateng, Jatim, DIY, Banten
  "unknown":       15, // tidak teridentifikasi — assume luar Jawa (SIRUP sering tak ada kota)
};

// Kata kunci per tier (lowercase)
const TIER_SANGAT_REMOTE = [
  "papua", "maluku", "kalimantan utara", "kaltara", "sulawesi tengah",
  "sulawesi utara", "sulawesi barat", "sulawesi tenggara", "ntt",
  "nusa tenggara timur", "halmahera", "sorong", "merauke", "timika",
];

const TIER_LUAR_JAWA = [
  "sumatra", "sumatera", "kalimantan", "sulawesi", "bali", "ntb",
  "nusa tenggara barat", "maluku utara", "aceh", "riau", "jambi",
  "bengkulu", "lampung", "kepulauan riau", "bangka", "belitung",
  "kalimantan selatan", "kalimantan timur", "kalimantan tengah",
  "kalimantan barat", "sulawesi selatan", "gorontalo", "batam",
  "medan", "palembang", "pekanbaru", "balikpapan", "samarinda",
  "makassar", "manado", "banda aceh", "padang", "banjarmasin",
];

const TIER_JAWA = [
  "jakarta", "jawa barat", "jabar", "jawa tengah", "jateng",
  "jawa timur", "jatim", "yogyakarta", "diy", "banten",
  "bandung", "surabaya", "semarang", "depok", "bekasi",
  "tangerang", "bogor", "malang", "solo", "yogya", "cirebon",
];

function tierLokasi(lokasi: string): TierLokasi {
  const l = lokasi.toLowerCase();
  if (TIER_SANGAT_REMOTE.some((k) => l.includes(k))) return "sangat-remote";
  if (TIER_LUAR_JAWA.some((k) => l.includes(k))) return "luar-jawa";
  if (TIER_JAWA.some((k) => l.includes(k))) return "jawa";
  return "unknown";
}

// ─── Skor: Nilai Proyek (20 poin) ────────────────────────────────────────────
// Nilai minimum Rp 100 juta sesuai CLAUDE.md. Skala non-linear: proyek besar
// jauh lebih strategis karena margin lebih baik dan switching cost tinggi.

interface TierNilai { min: number; poin: number; label: string }

const TIER_NILAI: TierNilai[] = [
  { min: 10_000_000_000, poin: 20, label: ">= Rp 10 M"  },
  { min:  5_000_000_000, poin: 18, label: ">= Rp 5 M"   },
  { min:  2_000_000_000, poin: 15, label: ">= Rp 2 M"   },
  { min:  1_000_000_000, poin: 12, label: ">= Rp 1 M"   },
  { min:    500_000_000, poin:  9, label: ">= Rp 500 jt" },
  { min:    200_000_000, poin:  6, label: ">= Rp 200 jt" },
  { min:    100_000_000, poin:  3, label: ">= Rp 100 jt" },
];

function scoreNilai(nilaiProyek: number): { poin: number; label: string } {
  for (const tier of TIER_NILAI) {
    if (nilaiProyek >= tier.min) return { poin: tier.poin, label: tier.label };
  }
  return { poin: 0, label: "< Rp 100 jt" };
}

// ─── Skor: Timing (15 poin) ──────────────────────────────────────────────────
// Lead dari SIRUP (RUP) belum punya deadline — ini justru ideal karena bisa
// outreach jauh sebelum tender dibuka. Lead LPSE punya deadline konkret.

interface TierTiming { label: string; poin: number }

function scoreTiming(deadline: string): TierTiming {
  // SIRUP / RUP: belum ada deadline → kesempatan outreach proaktif
  if (!deadline || deadline.trim() === "") {
    return { poin: 12, label: "RUP / belum tender (proaktif)" };
  }

  // Parse tanggal Indonesia
  const bulanMap: Record<string, number> = {
    januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
    juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
  };

  let due: Date | null = null;

  // Format: "15 Maret 2026"
  const matchLong = deadline.match(/(\d+)\s+(\w+)\s+(\d{4})/i);
  if (matchLong) {
    const day = parseInt(matchLong[1], 10);
    const monthName = matchLong[2].toLowerCase();
    const year = parseInt(matchLong[3], 10);
    const month = bulanMap[monthName];
    if (month !== undefined) {
      due = new Date(year, month, day);
    }
  }

  // Format: "15/03/2026" atau "2026-03-15"
  if (!due) {
    due = new Date(deadline);
  }

  if (!due || isNaN(due.getTime())) {
    return { poin: 12, label: "deadline tidak diketahui" };
  }

  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const targetMonth = new Date(due.getFullYear(), due.getMonth(), 1);

  // Hard reject jika bulan lampau (sebelum bulan berjalan)
  if (targetMonth < currentMonth) {
    return { poin: 0, label: "bulan lampau (expired)" };
  }

  const diffHari = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);

  if (diffHari < 0)   return { poin:  0, label: "sudah lewat deadline"    };
  if (diffHari < 7)   return { poin:  2, label: `${diffHari} hari (kritis)` };
  if (diffHari < 14)  return { poin:  5, label: `${diffHari} hari (mendesak)` };
  if (diffHari < 30)  return { poin: 10, label: `${diffHari} hari (normal)`   };
  return               { poin: 15, label: `${diffHari} hari (ideal)`      };
}

// ─── Hitung Skor ICP ──────────────────────────────────────────────────────────

function hitungScoreICP(lead: Lead): ScoreBreakdown {
  // Industri
  const skorIndustri = SKOR_INDUSTRI[lead.industri];
  const labelIndustri = `${lead.industri} (${skorIndustri}/30)`;

  // Lokasi
  const tier   = tierLokasi(lead.lokasi);
  const skorLokasi = SKOR_LOKASI[tier];
  const tierLabel: Record<TierLokasi, string> = {
    "sangat-remote": "sangat remote",
    "luar-jawa":     "luar Jawa",
    "jawa":          "Jawa",
    "unknown":       "tidak diketahui",
  };
  const labelLokasi = `${lead.lokasi} → ${tierLabel[tier]} (${skorLokasi}/35)`;

  // Nilai Proyek
  const { poin: skorNilai, label: labelNilai } = scoreNilai(lead.nilaiProyek);

  // Timing
  const { poin: skorTiming, label: labelTiming } = scoreTiming(lead.deadline);

  const total = skorIndustri + skorLokasi + skorNilai + skorTiming;

  return {
    industri:    { nilai: skorIndustri, maks: 30, label: labelIndustri },
    lokasi:      { nilai: skorLokasi,   maks: 35, label: labelLokasi   },
    nilaiProyek: { nilai: skorNilai,    maks: 20, label: labelNilai    },
    timing:      { nilai: skorTiming,   maks: 15, label: labelTiming   },
    total,
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function toPrioritas(score: number): PrioritasLead {
  if (score >= LEAD_SCORE_MIN) return "tinggi";
  if (score >= 40)             return "sedang";
  return "rendah";
}

function formatBreakdown(bd: ScoreBreakdown): string {
  return [
    `Industri: ${bd.industri.label}`,
    `Lokasi: ${bd.lokasi.label}`,
    `Nilai: ${bd.nilaiProyek.label} (${bd.nilaiProyek.nilai}/20)`,
    `Timing: ${bd.timing.label} (${bd.timing.nilai}/15)`,
    `Total ICP: ${bd.total}/100`,
  ].join(" | ");
}

function formatRupiah(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`;
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(0)} jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export function qualifyLeads(leads: Lead[]): QualifiedLead[] {
  console.log(`[Qualifier Agent] Menilai ${leads.length} lead dengan ICP scoring...`);
  console.log(`[Qualifier Agent] Bobot: Industri 30% | Lokasi 35% | Nilai 20% | Timing 15%`);

  let qualified = 0;
  let disqualified = 0;

  const results: QualifiedLead[] = leads.map((lead) => {
    const breakdown   = hitungScoreICP(lead);
    const score       = breakdown.total;
    const isQualified = score >= LEAD_SCORE_MIN;
    const prioritas   = toPrioritas(score);

    if (isQualified) qualified++;
    else disqualified++;

    return {
      ...lead,
      score,
      prioritas,
      alasanScore: formatBreakdown(breakdown),
      isQualified,
      scoreBreakdown: breakdown,
    };
  });

  // Urutkan: qualified dulu, lalu berdasarkan score tertinggi
  results.sort((a, b) => {
    if (a.isQualified !== b.isQualified) return a.isQualified ? -1 : 1;
    return b.score - a.score;
  });

  // Log summary table
  console.log(`[Qualifier Agent] ─────────────────────────────────────────`);
  results
    .filter((l) => l.isQualified)
    .slice(0, 10)
    .forEach((l, i) => {
      console.log(
        `[Qualifier Agent] #${i + 1} [${l.score}/100] ${l.namaPerusahaan.slice(0, 35).padEnd(35)} ` +
        `| ${l.industri.padEnd(12)} | ${formatRupiah(l.nilaiProyek)} | ${l.lokasi}`
      );
    });
  console.log(`[Qualifier Agent] ─────────────────────────────────────────`);
  console.log(
    `[Qualifier Agent] Qualified (>= ${LEAD_SCORE_MIN}): ${qualified} | ` +
    `Disqualified: ${disqualified} | Total: ${leads.length}`
  );

  return results;
}
