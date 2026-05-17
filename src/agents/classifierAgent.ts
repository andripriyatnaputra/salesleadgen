import { claude } from "../config/claude.js";
import type { Lead, KategoriKebutuhan, PrioritasLead } from "../config/claude.js";

// ─── Model & Kategori ─────────────────────────────────────────────────────────

// Versioned model ID yang diminta. Jika terjadi error "model not found",
// ganti ke alias stabil: "claude-sonnet-4-6"
const CLASSIFIER_MODEL = "claude-sonnet-4-6";

export type KategoriKlasifikasi =
  | "JARINGAN"    // LAN/WAN, WiFi, fiber, BWA, VSAT, internet
  | "IT_INFRA"    // server, PC, laptop, datacenter, hardware
  | "SOFTWARE"    // aplikasi, sistem informasi, ERP, web, mobile
  | "INTEGRASI"   // integrasi sistem, API, middleware, IoT
  | "LAINNYA";    // di luar layanan utama Starcom

// Pemetaan dari 5 kategori classifier → KategoriKebutuhan di Lead
const KATEGORI_MAP: Record<KategoriKlasifikasi, KategoriKebutuhan> = {
  JARINGAN:   "jaringan",
  IT_INFRA:   "it-infrastructure",
  SOFTWARE:   "software",
  INTEGRASI:  "sistem-integrasi",
  LAINNYA:    "it-infrastructure", // fallback, score-nya akan rendah
};

// ─── Tipe Internal ────────────────────────────────────────────────────────────

interface KlasifikasiResult {
  kategori: KategoriKlasifikasi;
  score: number;
  alasan: string;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Kamu adalah sistem klasifikasi lead B2G (Business-to-Government) \
untuk PT Starcom Solusindo, perusahaan IT Solutions di Bandung. Layanan kami:
- Jaringan: BWA/WiMAX, LAN/WAN, fiber optik, WiFi enterprise, VSAT, internet korporat
- IT Infrastructure: server, workstation, datacenter, UPS, perangkat keras IT
- Software: aplikasi custom, sistem informasi, ERP, web, mobile, e-government
- Integrasi: sistem integrasi, API, middleware, IoT, interoperabilitas
- Keamanan: cybersecurity, firewall, CCTV, access control

Target ICP: Migas, Pertambangan, Pemerintah, BUMN, Perbankan, Manufaktur, Kesehatan, Pendidikan.
Prioritas lokasi: luar Jawa, daerah remote/terpencil, kawasan industri.
Nilai proyek minimum: Rp 100 juta.

PENTING - Klasifikasikan sebagai LAINNYA jika tender adalah:
- Permit, AMDAL, UKL/UPL, izin lingkungan
- Drilling, pengeboran sumur, well services
- Piping, pipeline, konstruksi pipa
- Civil work, konstruksi sipil, bangunan
- Mechanical equipment, rotating equipment
- Kelistrikan murni (bukan IT infrastructure)
- Catering, konsumsi, housekeeping
- Transportasi, kendaraan
- Chemical, bahan kimia
- Alat kesehatan non-IT
- Safety equipment (APD, alat K3)
- Security guard (bukan sistem CCTV/access control)

Tugasmu adalah mengklasifikasikan tender pengadaan ke kategori yang paling sesuai dengan \
layanan Starcom dan menolak yang tidak relevan dengan skor rendah. Jawab HANYA dengan JSON valid tanpa \
markdown code block.`;

// ─── Builder Prompt ───────────────────────────────────────────────────────────

function buildPrompt(lead: Lead): string {
  const nilai = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(lead.nilaiProyek);

  return `Klasifikasikan tender pengadaan berikut:

Judul Paket   : ${lead.namaProyek}
Instansi      : ${lead.namaPerusahaan}
Industri      : ${lead.industri}
Lokasi        : ${lead.lokasi}
Nilai Pagu    : ${nilai}
Deskripsi     : ${lead.deskripsiKebutuhan}

─── KATEGORI (pilih SATU) ───────────────────────────────
JARINGAN   — jaringan komputer, LAN/WAN, WiFi, fiber optik, BWA/WiMAX, internet, telekomunikasi, bandwidth, VSAT, radio komunikasi data
IT_INFRA   — server, komputer/PC/laptop, hardware IT, datacenter, UPS, storage, perangkat keras komputer
SOFTWARE   — aplikasi custom, sistem informasi, website, mobile app, ERP, SIMRS, e-government, SaaS, portal (HARUS ada development/implementasi software)
INTEGRASI  — integrasi sistem, API, middleware, interoperabilitas, IoT, SCADA
LAINNYA    — tender NON-IT seperti: permit/AMDAL, drilling, piping, civil work, mechanical, catering, transportasi, chemical, alat medis non-IT, APD, security guard

─── PANDUAN SKOR RELEVANSI (0–100) ─────────────────────
• Kesesuaian layanan Starcom        : 0–50 poin
• Nilai proyek ≥ Rp 1 M            : +20 poin
  Nilai proyek Rp 500 jt – 1 M     : +10 poin
• Industri prioritas (ICP)          : 0–20 poin
• Lokasi luar Jawa / remote         : +10 poin
• Kategori LAINNYA wajib skor ≤ 20
• Tender permit/AMDAL/drilling/piping/civil work wajib kategori LAINNYA dengan skor 0-5

Jawab HANYA dalam format JSON berikut (tanpa markdown):
{"kategori":"JARINGAN|IT_INFRA|SOFTWARE|INTEGRASI|LAINNYA","score":0,"alasan":"maks 80 kata"}`;
}

// ─── Parser Response ──────────────────────────────────────────────────────────

const VALID_KATEGORI = new Set<string>([
  "JARINGAN", "IT_INFRA", "SOFTWARE", "INTEGRASI", "LAINNYA",
]);

function parseResponse(raw: string): KlasifikasiResult | null {
  // Coba parse langsung
  try {
    const parsed = JSON.parse(raw.trim()) as unknown;
    if (isValidResult(parsed)) return parsed;
  } catch { /* lanjut ke fallback */ }

  // Ekstrak JSON dari teks (Claude kadang tambah kalimat pembuka)
  const match = raw.match(/\{[\s\S]*?"kategori"[\s\S]*?\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (isValidResult(parsed)) return parsed;
    } catch { /* lanjut ke fallback */ }
  }

  return null;
}

function isValidResult(v: unknown): v is KlasifikasiResult {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["kategori"] === "string" &&
    VALID_KATEGORI.has(o["kategori"]) &&
    typeof o["score"] === "number" &&
    o["score"] >= 0 &&
    o["score"] <= 100 &&
    typeof o["alasan"] === "string"
  );
}

// ─── Klasifikasi Satu Lead ────────────────────────────────────────────────────

async function classifyOne(lead: Lead): Promise<KlasifikasiResult> {
  const FALLBACK: KlasifikasiResult = {
    kategori: "LAINNYA",
    score: 0,
    alasan: "Gagal diklasifikasikan — response tidak valid",
  };

  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const message = await claude.messages.create({
        model: CLASSIFIER_MODEL,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildPrompt(lead) }],
      });

      const raw =
        message.content[0]?.type === "text" ? message.content[0].text : "";
      const result = parseResponse(raw);

      if (result) return result;

      lastError = `Response tidak parseable: ${raw.slice(0, 100)}`;
    } catch (err) {
      lastError = (err as Error).message;
      if (attempt === 1) {
        // Tunggu sebentar sebelum retry
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  console.error(`[Classifier Agent] Fallback digunakan: ${lastError}`);
  return FALLBACK;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function scoreToprioritas(score: number): PrioritasLead {
  if (score >= 70) return "tinggi";
  if (score >= 40) return "sedang";
  return "rendah";
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function classifyLeads(leads: Lead[]): Promise<Lead[]> {
  console.log(`[Classifier Agent] Mulai klasifikasi ${leads.length} lead...`);

  const results: Lead[] = [];
  let tinggi = 0, sedang = 0, rendah = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i]!;
    const progress = `[${i + 1}/${leads.length}]`;

    console.log(
      `[Classifier Agent] ${progress} "${lead.namaProyek.slice(0, 60)}..."`
    );

    const klasifikasi = await classifyOne(lead);

    const classified: Lead = {
      ...lead,
      kebutuhan: KATEGORI_MAP[klasifikasi.kategori],
      score: klasifikasi.score,
      prioritas: scoreToprioritas(klasifikasi.score),
      alasanScore: `[${klasifikasi.kategori}] ${klasifikasi.alasan}`,
    };

    results.push(classified);

    // Hitung distribusi
    if (classified.prioritas === "tinggi") tinggi++;
    else if (classified.prioritas === "sedang") sedang++;
    else rendah++;

    console.log(
      `[Classifier Agent] ${progress} → ${klasifikasi.kategori} | score: ${klasifikasi.score} | ${classified.prioritas}`
    );
  }

  console.log(
    `[Classifier Agent] Selesai. Tinggi: ${tinggi} | Sedang: ${sedang} | Rendah: ${rendah}`
  );

  return results;
}
