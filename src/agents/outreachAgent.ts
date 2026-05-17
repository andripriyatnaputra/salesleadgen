import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { claude, MODEL, SCRAPE_DELAY_MS } from "../config/claude.js";
import type { KategoriKebutuhan } from "../config/claude.js";
import type { QualifiedLead } from "./qualifierAgent.js";

// ─── Path Output ──────────────────────────────────────────────────────────────

const __dirname   = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR  = join(__dirname, "../output");
const OUTPUT_FILE = join(OUTPUT_DIR, "outreach.json");

// ─── Tipe Output ──────────────────────────────────────────────────────────────

export interface OutreachEmail {
  subjek: string;
  kepada: string; // nama PIC atau jabatan generic
  isi:    string;
}

export interface OutreachRecord {
  leadId:         string;
  namaPerusahaan: string;
  namaProyek:     string;
  urlTender:      string;
  industri:       string;
  kebutuhan:      string;
  lokasi:         string;
  nilaiProyek:    number;
  score:          number;
  isQualified:    boolean;
  scoreBreakdown: QualifiedLead["scoreBreakdown"];
  pic:            QualifiedLead["pic"];
  email:          OutreachEmail;
  dibuatPada:     string;
}

export interface OutreachOutput {
  dibuatPada:  string;
  totalLeads:  number;
  modelDigunakan: string;
  leads:       OutreachRecord[];
}

// ─── Katalog Solusi Starcom per Kategori ─────────────────────────────────────
// Digunakan dalam prompt supaya Claude menyebut nama produk/layanan yang konkret
// dan relevan dengan kebutuhan tiap lead, bukan generik.

const SOLUSI_STARCOM: Record<KategoriKebutuhan, string[]> = {
  "jaringan": [
    "jaringan LAN/WAN enterprise managed",
    "konektivitas BWA/WiMAX untuk lokasi terpencil",
    "WiFi enterprise (Cisco, Ubiquiti, MikroTik) coverage luas",
    "VSAT dan backup link untuk disaster recovery",
    "fiber optik backbone antar gedung/site",
    "network monitoring & NOC 24/7",
  ],
  "it-infrastructure": [
    "server Dell PowerEdge / HP ProLiant + storage",
    "workstation HP, Dell, Lenovo bergaransi resmi",
    "UPS APC / Eaton untuk proteksi daya",
    "rack, PDU, dan aksesori datacenter",
    "deployment, konfigurasi, dan commissioning",
    "garansi onsite + dukungan purna jual",
  ],
  "software": [
    "pengembangan aplikasi custom web & mobile",
    "sistem informasi manajemen (SIM) sesuai kebutuhan",
    "integrasi modul dengan sistem eksisting",
    "ERP dan aplikasi enterprise",
    "e-government dan portal layanan publik",
    "pemeliharaan berkala dan SLA after-sales",
  ],
  "sistem-integrasi": [
    "integrasi multi-sistem via REST API / Web Service",
    "middleware enterprise untuk interoperabilitas",
    "IoT gateway dan sensor management platform",
    "data pipeline & ETL antar platform",
    "SSO (Single Sign-On) enterprise",
  ],
  "cybersecurity": [
    "firewall enterprise Fortinet / Cisco",
    "SOC monitoring 24/7 dengan SIEM",
    "vulnerability assessment & penetration testing",
    "network access control (NAC)",
    "endpoint protection & EDR",
  ],
  "cctv": [
    "IP camera Hikvision / Axis HD & 4K",
    "NVR/DVR dengan storage kapasitas besar",
    "video analytics & motion detection",
    "access control terintegrasi",
    "remote monitoring dashboard",
  ],
  "cloud": [
    "managed cloud (AWS, Azure, GCP)",
    "VPS dan dedicated server",
    "colocation di datacenter Tier III",
    "cloud migration & readiness assessment",
    "backup & disaster recovery as a service",
  ],
};

const LABEL_KEBUTUHAN: Record<KategoriKebutuhan, string> = {
  "jaringan":          "Jaringan & Konektivitas",
  "it-infrastructure": "IT Infrastructure & Hardware",
  "software":          "Software & Sistem Informasi",
  "sistem-integrasi":  "Integrasi Sistem",
  "cybersecurity":     "Keamanan Siber",
  "cctv":              "Surveillance & Access Control",
  "cloud":             "Cloud & Hosting",
};

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Kamu adalah copywriter senior di PT Starcom Solusindo (starcoms.net), \
perusahaan IT Solutions di Bandung. Tugasmu: menulis draft email penawaran B2G (Business-to-Government) \
yang personal, profesional, dan persuasif dalam Bahasa Indonesia formal.

Panduan penulisan email:
1. Langsung ke poin — jangan pembuka generik seperti "Dengan hormat, bersama ini kami sampaikan..."
2. Sebut NAMA INSTANSI secara spesifik di paragraf pertama
3. Sebut NAMA PAKET/PROYEK secara eksplisit untuk menunjukkan kita sudah membaca RUP-nya
4. Jelaskan 2–3 solusi STARCOM yang konkret dan relevan dengan kebutuhan mereka
5. Satu paragraf value proposition: mengapa Starcom vs kompetitor
6. CTA yang spesifik: minta jadwal demo/diskusi teknis, bukan sekadar "hubungi kami"
7. Panjang: 200–280 kata — cukup untuk meyakinkan, tidak terlalu panjang untuk dibaca
8. Nada: profesional tapi bersahabat, hindari kalimat klise pengadaan
9. Jangan tambahkan [brackets] atau placeholder — isi semua detail dari konteks yang diberikan

Format output HANYA:
SUBJEK: <baris subjek email>
---
<isi email lengkap tanpa penjelasan tambahan>`;

// ─── Builder Konteks per Lead ─────────────────────────────────────────────────

function buildPrompt(lead: QualifiedLead): string {
  const solusiList = SOLUSI_STARCOM[lead.kebutuhan]
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join("\n");

  const labelKebutuhan = LABEL_KEBUTUHAN[lead.kebutuhan];

  const nilaiFormatted = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(lead.nilaiProyek);

  const sapaan = lead.pic.nama
    ? `${lead.pic.nama} (${lead.pic.jabatan})`
    : `Yth. Pejabat Pengadaan / Panitia ${lead.namaPerusahaan}`;

  const deadlineInfo = lead.deadline
    ? `Deadline pemasukan: ${lead.deadline}`
    : "Status: masih dalam tahap RUP (belum tender resmi — ideal untuk pendekatan proaktif)";

  return `Tulis email outreach untuk lead berikut:

─── DATA LEAD ───────────────────────────────────────────
Instansi       : ${lead.namaPerusahaan}
Industri       : ${lead.industri}
Lokasi         : ${lead.lokasi}
Nama Paket     : ${lead.namaProyek}
Nilai Pagu     : ${nilaiFormatted}
${deadlineInfo}
Kategori Kebutuhan: ${labelKebutuhan}
ICP Score      : ${lead.score}/100 (${lead.prioritas})
Deskripsi      : ${lead.deskripsiKebutuhan}

─── KONTAK PENERIMA ─────────────────────────────────────
${sapaan}
${lead.pic.email ? `Email: ${lead.pic.email}` : ""}

─── SOLUSI STARCOM YANG RELEVAN ─────────────────────────
${solusiList}

─── INSTRUKSI ───────────────────────────────────────────
Tulis email yang menyebut:
1. Nama instansi "${lead.namaPerusahaan}" secara eksplisit
2. Nama paket "${lead.namaProyek}" untuk menunjukkan kita sudah mempelajari kebutuhan mereka
3. Minimal 2 solusi spesifik dari daftar di atas yang paling relevan
4. Keunggulan Starcom untuk industri ${lead.industri} di ${lead.lokasi}

Ingat format output: baris pertama SUBJEK: ... lalu --- lalu isi email.`;
}

// ─── Parser Response Claude ───────────────────────────────────────────────────

interface ParsedEmail { subjek: string; isi: string }

function parseEmailResponse(raw: string, lead: QualifiedLead): ParsedEmail {
  const lines  = raw.trim().split("\n");
  const subjekLine = lines.find((l) => l.toUpperCase().startsWith("SUBJEK:"));
  const separator  = lines.findIndex((l) => l.trim() === "---");

  const subjek = subjekLine
    ? subjekLine.replace(/^SUBJEK:\s*/i, "").trim()
    : `Penawaran Solusi ${LABEL_KEBUTUHAN[lead.kebutuhan]} – ${lead.namaPerusahaan}`;

  const isi = separator >= 0
    ? lines.slice(separator + 1).join("\n").trim()
    : lines.filter((l) => !l.toUpperCase().startsWith("SUBJEK:")).join("\n").trim();

  return { subjek, isi };
}

// ─── Generator per Lead ───────────────────────────────────────────────────────

async function generateOne(lead: QualifiedLead): Promise<OutreachEmail> {
  const FALLBACK_SUBJEK =
    `Penawaran Solusi ${LABEL_KEBUTUHAN[lead.kebutuhan]} – ${lead.namaPerusahaan}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const message = await claude.messages.create({
        model:      MODEL,
        max_tokens: 800,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: "user", content: buildPrompt(lead) }],
      });

      const raw = message.content[0]?.type === "text"
        ? message.content[0].text
        : "";

      if (!raw.trim()) throw new Error("Response kosong dari Claude");

      const { subjek, isi } = parseEmailResponse(raw, lead);

      return {
        subjek,
        kepada: lead.pic.nama || `Pejabat Pengadaan – ${lead.namaPerusahaan}`,
        isi,
      };
    } catch (err) {
      const msg = (err as Error).message;
      if (attempt === 1) {
        console.warn(`[Outreach Agent] Retry generate untuk "${lead.namaPerusahaan}": ${msg}`);
        await new Promise((r) => setTimeout(r, 3000));
      } else {
        console.error(`[Outreach Agent] Gagal generate email: ${msg}`);
      }
    }
  }

  // Fallback: subjek + isi kosong — sales bisa isi manual
  return {
    subjek: FALLBACK_SUBJEK,
    kepada: lead.pic.nama || `Pejabat Pengadaan – ${lead.namaPerusahaan}`,
    isi:    "[Gagal generate otomatis — mohon buat email secara manual]",
  };
}

// ─── Simpan ke JSON ───────────────────────────────────────────────────────────

function saveToFile(output: OutreachOutput): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
  console.log(`[Outreach Agent] Disimpan ke: ${OUTPUT_FILE}`);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function generateOutreach(
  leads: QualifiedLead[]
): Promise<OutreachOutput> {
  // Proses SEMUA lead — tidak ada filter score minimum di sini.
  // Output tetap disimpan agar bisa direviu manual berapapun scorenya.
  console.log(`[Outreach Agent] Memproses ${leads.length} lead (semua score)...`);

  const records: OutreachRecord[] = [];

  for (let i = 0; i < leads.length; i++) {
    const lead     = leads[i]!;
    const progress = `[${i + 1}/${leads.length}]`;

    console.log(
      `[Outreach Agent] ${progress} Generating → ` +
      `${lead.namaPerusahaan.slice(0, 45)} | score: ${lead.score} | ${lead.isQualified ? "QUALIFIED" : "review"}`
    );

    const email = await generateOne(lead);

    records.push({
      leadId:         lead.id,
      namaPerusahaan: lead.namaPerusahaan,
      namaProyek:     lead.namaProyek,
      urlTender:      lead.url,
      industri:       lead.industri,
      kebutuhan:      lead.kebutuhan,
      lokasi:         lead.lokasi,
      nilaiProyek:    lead.nilaiProyek,
      score:          lead.score,
      isQualified:    lead.isQualified,
      scoreBreakdown: lead.scoreBreakdown,
      pic:            lead.pic,
      email,
      dibuatPada:     new Date().toISOString(),
    });

    console.log(
      `[Outreach Agent] ${progress} ✓ Subjek: "${email.subjek.slice(0, 60)}"`
    );

    // Rate limit antar Claude call (menghindari throttle)
    if (i < leads.length - 1) {
      await new Promise((r) => setTimeout(r, SCRAPE_DELAY_MS));
    }
  }

  const output: OutreachOutput = {
    dibuatPada:     new Date().toISOString(),
    totalLeads:     records.length,
    modelDigunakan: MODEL,
    leads:          records,
  };

  saveToFile(output);

  console.log(
    `[Outreach Agent] Selesai. ${records.length} email draft tersimpan di outreach.json`
  );

  return output;
}
