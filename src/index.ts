import { writeFileSync, mkdirSync } from "fs";
import { join, dirname }           from "path";
import { fileURLToPath }           from "url";
import { fetchPengadaanTenders }   from "./agents/sources/pengadaanAgent.js";
import { fetchCivdSkkMigas }       from "./agents/sources/civdAgent.js";
import { fetchPamJayaTenders }     from "./agents/sources/pamJayaAgent.js";
import { fetchKaiTenders }         from "./agents/sources/kaiAgent.js";
import { classifyLeads }           from "./agents/classifierAgent.js";
import { qualifyLeads }            from "./agents/qualifierAgent.js";
import { generateOutreach }        from "./agents/outreachAgent.js";
import type { Lead }               from "./config/claude.js";

const __dirname    = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR   = join(__dirname, "output");

function saveRawLeads(leads: Lead[]): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const path = join(OUTPUT_DIR, "raw-leads.json");

  const rows = leads.map((l, i) => ({
    no:             i + 1,
    namaProyek:     l.namaProyek,
    namaPerusahaan: l.namaPerusahaan,
    urlTender:      l.url,
    industri:       l.industri,
    kebutuhan:      l.kebutuhan,
    nilaiProyek:    l.nilaiProyek,
    deadline:       l.deadline,
    status:         l.deskripsiKebutuhan.match(/Status: ([^|]+)/)?.[1]?.trim() ?? "",
    deskripsi:      l.deskripsiKebutuhan,
  }));

  writeFileSync(path, JSON.stringify({ total: leads.length, leads: rows }, null, 2), "utf-8");
  console.log(`      raw-leads.json tersimpan: ${leads.length} leads → ${path}\n`);
}

async function main() {
  console.log("=== Starcom Solusindo — Lead Generation Pipeline ===\n");
  console.log("Sumber aktif : tender.pengadaan.com, CIVD SKK Migas, PAM Jaya, KAI RAPID");
  console.log("LPSE/SIRUP   : dinonaktifkan sementara\n");

  // ── 1. Scraping — semua sumber paralel ───────────────────────────────────
  console.log("[1/5] Mengambil tender dari semua sumber...");
  const [pengadaanLeads, civdLeads, pamJayaLeads, kaiLeads] = await Promise.all([
    fetchPengadaanTenders(),
    fetchCivdSkkMigas(),
    fetchPamJayaTenders(),
    fetchKaiTenders(),
  ]);

  console.log(`      tender.pengadaan.com : ${pengadaanLeads.length} leads`);
  console.log(`      CIVD SKK Migas       : ${civdLeads.length} leads`);
  console.log(`      PAM Jaya             : ${pamJayaLeads.length} leads`);
  console.log(`      KAI RAPID            : ${kaiLeads.length} leads`);

  // Gabung & deduplikasi berdasarkan URL
  const seen  = new Set<string>();
  const rawLeads: Lead[] = [];
  for (const lead of [...pengadaanLeads, ...civdLeads, ...pamJayaLeads, ...kaiLeads]) {
    if (!seen.has(lead.url)) {
      seen.add(lead.url);
      rawLeads.push(lead);
    }
  }
  console.log(`      Total unik           : ${rawLeads.length} leads\n`);

  if (rawLeads.length === 0) {
    console.log("Tidak ada data. Cek koneksi ke sumber scraping.");
    return;
  }

  // ── 2. Simpan raw leads dulu — sebelum Claude dijalankan ─────────────────
  console.log("[2/5] Menyimpan raw leads (semua, tanpa scoring)...");
  saveRawLeads(rawLeads);

  // ── 3. Klasifikasi via Claude AI ──────────────────────────────────────────
  console.log("[3/5] Mengklasifikasikan dengan Claude AI...");
  const classified = await classifyLeads(rawLeads);
  const relevan    = classified.filter((l) => l.score > 0);
  console.log(`      Relevan (score > 0): ${relevan.length} dari ${classified.length}\n`);

  // ── 4. ICP Scoring ────────────────────────────────────────────────────────
  console.log("[4/5] Menerapkan ICP scoring...");
  const qualified = qualifyLeads(relevan);
  const lolos     = qualified.filter((l) => l.isQualified);
  console.log(`      Qualified (>= 70): ${lolos.length} | Semua scored: ${qualified.length}\n`);

  // ── 5. Generate Email Outreach (semua, berapapun score) ───────────────────
  console.log("[5/5] Membuat draft email outreach untuk semua lead...");
  const output = await generateOutreach(qualified);
  console.log(`      ${output.totalLeads} email draft tersimpan.\n`);

  console.log("=== Pipeline Selesai ===");
  console.log(`raw-leads.json : ${rawLeads.length} leads (pengadaan.com: ${pengadaanLeads.length} | CIVD: ${civdLeads.length} | PAM Jaya: ${pamJayaLeads.length} | KAI: ${kaiLeads.length})`);
  console.log(`outreach.json  : ${output.totalLeads} leads (sudah ada score + email draft)`);
}

main().catch(console.error);
