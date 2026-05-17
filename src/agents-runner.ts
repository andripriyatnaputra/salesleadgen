import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { fetchPengadaanTenders } from "./agents/sources/pengadaanAgent.js";
import { fetchCivdSkkMigas, fetchFromProcurementFile } from "./agents/sources/civdAgent.js";
import { fetchPamJayaTenders } from "./agents/sources/pamJayaAgent.js";
import { fetchKaiTenders } from "./agents/sources/kaiAgent.js";
import { fetchBpjsTenders } from "./agents/sources/bpjsAgent.js";
import { fetchBjbTenders } from "./agents/sources/bjbAgent.js";
import { fetchAirnavTenders } from "./agents/sources/airnavAgent.js";
import { classifyLeads } from "./agents/classifierAgent.js";
import { qualifyLeads } from "./agents/qualifierAgent.js";
import { generateOutreach } from "./agents/outreachAgent.js";
import type { Lead } from "./config/claude.js";
import { LeadRepository, pool, type RawLead } from "./config/database.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");

type AgentType = "pengadaan" | "civd" | "civd-file" | "pamjaya" | "kai" | "bpjs" | "bjb" | "airnav" | "classifier" | "qualifier" | "outreach";

function leadToDbFormat(lead: Lead): RawLead {
  return {
    lead_id: lead.id,
    source: lead.sumber,
    url: lead.url,
    nama_proyek: lead.namaProyek,
    nama_perusahaan: lead.namaPerusahaan,
    industri: lead.industri,
    lokasi: lead.lokasi,
    nilai_proyek: lead.nilaiProyek,
    deadline: lead.deadline,
    kebutuhan: lead.kebutuhan,
    deskripsi_kebutuhan: lead.deskripsiKebutuhan,
    pic_nama: lead.pic.nama,
    pic_jabatan: lead.pic.jabatan,
    pic_email: lead.pic.email,
    pic_telepon: lead.pic.telepon,
    status: "active",
  };
}

async function saveRawLeads(leads: Lead[]): Promise<void> {
  // Save to JSON file (backward compatibility)
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const path = join(OUTPUT_DIR, "raw-leads.json");

  const rows = leads.map((l, i) => ({
    no: i + 1,
    namaProyek: l.namaProyek,
    namaPerusahaan: l.namaPerusahaan,
    urlTender: l.url,
    industri: l.industri,
    kebutuhan: l.kebutuhan,
    nilaiProyek: l.nilaiProyek,
    deadline: l.deadline,
    status: l.deskripsiKebutuhan.match(/Status: ([^|]+)/)?.[1]?.trim() ?? "",
    deskripsi: l.deskripsiKebutuhan,
  }));

  writeFileSync(path, JSON.stringify({ total: leads.length, leads: rows }, null, 2), "utf-8");
  console.log(`✅ raw-leads.json tersimpan: ${leads.length} leads → ${path}`);

  // Save to PostgreSQL
  try {
    const dbLeads = leads.map(leadToDbFormat);
    const saved = await LeadRepository.bulkInsertRawLeads(dbLeads);
    console.log(`✅ Database: ${saved} leads tersimpan/updated di PostgreSQL`);
  } catch (error) {
    console.error(`⚠️ Database error (continuing with JSON only):`, (error as Error).message);
  }
}

function loadRawLeads(): Lead[] {
  const path = join(OUTPUT_DIR, "raw-leads.json");
  if (!existsSync(path)) {
    console.log("⚠️ raw-leads.json tidak ditemukan, mengembalikan array kosong");
    return [];
  }

  const data = JSON.parse(readFileSync(path, "utf-8"));
  // Convert back to Lead format
  return data.leads.map((l: any) => ({
    namaProyek: l.namaProyek,
    namaPerusahaan: l.namaPerusahaan,
    url: l.urlTender,
    industri: l.industri,
    kebutuhan: l.kebutuhan,
    nilaiProyek: l.nilaiProyek,
    deadline: l.deadline,
    deskripsiKebutuhan: l.deskripsi,
  }));
}

async function main() {
  const selectedAgents = process.argv.slice(2) as AgentType[];

  console.log("=== Starcom LeadGen — Manual Agent Runner ===");
  console.log(`Agent yang dipilih: ${selectedAgents.join(", ")}\n`);

  const hasScraping = selectedAgents.some((a) =>
    ["pengadaan", "civd", "civd-file", "pamjaya", "kai", "bpjs", "bjb", "airnav"].includes(a)
  );
  const hasProcessing = selectedAgents.some((a) =>
    ["classifier", "qualifier", "outreach"].includes(a)
  );

  let rawLeads: Lead[] = [];

  // ── SCRAPING AGENTS ──────────────────────────────────────────────────────
  if (hasScraping) {
    console.log("[1] Menjalankan scraping agents...");
    const results: Lead[][] = [];

    if (selectedAgents.includes("pengadaan")) {
      console.log("  → Pengadaan.com...");
      const leads = await fetchPengadaanTenders();
      results.push(leads);
      console.log(`     ✓ ${leads.length} leads dari Pengadaan.com`);
    }

    if (selectedAgents.includes("civd")) {
      console.log("  → CIVD SKK Migas (scraping)...");
      const leads = await fetchCivdSkkMigas();
      results.push(leads);
      console.log(`     ✓ ${leads.length} leads dari CIVD`);
    }

    if (selectedAgents.includes("civd-file")) {
      console.log("  → CIVD Procurement List (from file)...");
      // Cari file procurement list di folder data
      const procFiles = [
        "./src/data/procurement-lists/procurement-list-2026.txt",
        "./src/data/procurement-lists/SRT-0023_4_Feb_2026_extracted_text.txt",
      ];

      let loaded = false;
      for (const file of procFiles) {
        if (existsSync(file)) {
          console.log(`     → Membaca: ${file}`);
          const leads = await fetchFromProcurementFile(file, true);
          results.push(leads);
          console.log(`     ✓ ${leads.length} leads dari procurement file`);
          loaded = true;
          break;
        }
      }

      if (!loaded) {
        console.log(`     ⚠️ File procurement list tidak ditemukan di folder data/`);
        console.log(`     💡 Simpan file procurement list Anda di:`);
        console.log(`        - src/data/procurement-lists/procurement-list-2026.txt`);
      }
    }

    if (selectedAgents.includes("pamjaya")) {
      console.log("  → PAM Jaya...");
      const leads = await fetchPamJayaTenders();
      results.push(leads);
      console.log(`     ✓ ${leads.length} leads dari PAM Jaya`);
    }

    if (selectedAgents.includes("kai")) {
      console.log("  → KAI RAPID...");
      const leads = await fetchKaiTenders();
      results.push(leads);
      console.log(`     ✓ ${leads.length} leads dari KAI`);
    }

    if (selectedAgents.includes("bpjs")) {
      console.log("  → BPJS Ketenagakerjaan...");
      const leads = await fetchBpjsTenders();
      results.push(leads);
      console.log(`     ✓ ${leads.length} leads dari BPJS`);
    }

    if (selectedAgents.includes("bjb")) {
      console.log("  → Bank Jabar Banten...");
      const leads = await fetchBjbTenders();
      results.push(leads);
      console.log(`     ✓ ${leads.length} leads dari BJB`);
    }

    if (selectedAgents.includes("airnav")) {
      console.log("  → Airnav Indonesia...");
      const leads = await fetchAirnavTenders();
      results.push(leads);
      console.log(`     ✓ ${leads.length} leads dari Airnav`);
    }

    // Deduplikasi berdasarkan ID atau kombinasi URL + nama proyek
    const seen = new Set<string>();
    for (const leadGroup of results) {
      for (const lead of leadGroup) {
        // Gunakan ID jika ada, atau fallback ke kombinasi URL + nama proyek
        const key = lead.id || `${lead.url}::${lead.namaProyek}`;
        if (!seen.has(key)) {
          seen.add(key);
          rawLeads.push(lead);
        }
      }
    }

    console.log(`\n  Total leads unik: ${rawLeads.length}`);

    // Simpan raw leads
    await saveRawLeads(rawLeads);
    console.log("");
  }

  // ── PROCESSING AGENTS ────────────────────────────────────────────────────
  if (hasProcessing) {
    // Jika tidak ada scraping, load dari file
    if (!hasScraping) {
      console.log("[1] Loading raw leads dari file...");
      rawLeads = loadRawLeads();
      console.log(`  ✓ ${rawLeads.length} leads dimuat\n`);
    }

    if (rawLeads.length === 0) {
      console.log("❌ Tidak ada raw leads untuk diproses. Jalankan scraping agent terlebih dahulu.");
      process.exit(1);
    }

    // Classifier
    if (selectedAgents.includes("classifier")) {
      console.log("[2] Menjalankan Classifier Agent...");
      const classified = await classifyLeads(rawLeads);
      const relevan = classified.filter((l) => l.score > 0);
      console.log(`  ✓ ${relevan.length} dari ${classified.length} leads relevan\n`);
      rawLeads = classified; // Update untuk agent selanjutnya
    }

    // Qualifier
    if (selectedAgents.includes("qualifier")) {
      console.log("[3] Menjalankan Qualifier Agent...");
      const qualified = qualifyLeads(rawLeads);
      const lolos = qualified.filter((l) => l.isQualified);
      console.log(`  ✓ ${lolos.length} leads qualified (score >= 70)\n`);
      rawLeads = qualified; // Update untuk agent selanjutnya
    }

    // Outreach
    if (selectedAgents.includes("outreach")) {
      console.log("[4] Menjalankan Outreach Agent...");
      const output = await generateOutreach(rawLeads);
      console.log(`  ✓ ${output.totalLeads} email draft tersimpan\n`);
    }
  }

  console.log("=== Pipeline Selesai ===");

  // Close database connection
  await pool.end();
}

main().catch(async (error) => {
  console.error("❌ Error:", error);
  await pool.end();
  process.exit(1);
});
