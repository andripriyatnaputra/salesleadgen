import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";

dotenv.config();

if (!process.env["ANTHROPIC_API_KEY"]) {
  throw new Error("[CONFIG] ANTHROPIC_API_KEY tidak ditemukan di file .env");
}

export const claude = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
});

export const MODEL = "claude-sonnet-4-6";

// Minimum score untuk lanjut ke tahap outreach (dari CLAUDE.md)
export const LEAD_SCORE_MIN = 70;

// Delay antar request scraping untuk menghormati server (dari CLAUDE.md)
export const SCRAPE_DELAY_MS = 2500;

// ─── Tipe Sumber Data ────────────────────────────────────────────────────────

export type LeadSource = "LPSE" | "CIVD" | "PENGADAAN" | "BJB" | "BPJS" | "AIRNAV" | "PAM_JAYA";

// ─── ICP (Ideal Customer Profile) ────────────────────────────────────────────

export type IndustriICP =
  | "Migas"
  | "Pertambangan"
  | "Pemerintah"
  | "BUMN"
  | "Perbankan"
  | "Manufaktur"
  | "Kesehatan"
  | "Pendidikan"
  | "Lainnya";

export type KategoriKebutuhan =
  | "jaringan"        // BWA/WiMAX, LAN/WAN, fiber
  | "it-infrastructure" // server, hardware, datacenter
  | "cybersecurity"   // firewall, SOC, pentest
  | "cctv"            // surveillance, access control
  | "cloud"           // cloud services, hosting
  | "software"        // custom app, web, mobile, ERP
  | "sistem-integrasi"; // integrasi antar sistem

export type PrioritasLead = "tinggi" | "sedang" | "rendah";

// ─── Interface Lead ───────────────────────────────────────────────────────────

export interface PIC {
  nama: string;
  jabatan: string;
  email: string;
  telepon: string;
}

export interface Lead {
  // Identitas
  id: string;
  sumber: LeadSource;
  url: string;

  // Informasi proyek/tender
  namaProyek: string;
  namaPerusahaan: string;
  industri: IndustriICP;
  lokasi: string;
  nilaiProyek: number; // dalam rupiah
  deadline: string;   // ISO date string

  // Kebutuhan & klasifikasi
  kebutuhan: KategoriKebutuhan;
  deskripsiKebutuhan: string;

  // Kontak PIC
  pic: PIC;

  // Scoring
  score: number;      // 0–100, minimum 70 untuk outreach
  prioritas: PrioritasLead;
  alasanScore: string;

  // Metadata
  tanggalDitemukan: string; // ISO date string
}

// ─── Helper ───────────────────────────────────────────────────────────────────

export function isLeadLayak(lead: Lead): boolean {
  return lead.score >= LEAD_SCORE_MIN;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
