import { readFileSync, existsSync } from "fs";
import path from "path";

const OUTPUT_DIR = path.join(process.cwd(), "..", "src", "output");

// ─── Raw Leads ────────────────────────────────────────────────────────────────

export interface RawLead {
  no:             number;
  namaProyek:     string;
  namaPerusahaan: string;
  urlTender:      string;
  industri:       string;
  kebutuhan:      string;
  nilaiProyek:    number;
  deadline:       string;
  status:         string;
  deskripsi:      string;
}

export interface RawLeadsFile {
  total: number;
  leads: RawLead[];
}

export function getRawLeads(): RawLeadsFile {
  const file = path.join(OUTPUT_DIR, "raw-leads.json");
  if (!existsSync(file)) return { total: 0, leads: [] };
  return JSON.parse(readFileSync(file, "utf-8")) as RawLeadsFile;
}

// ─── Outreach ─────────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  industri:    { nilai: number; maks: number; label: string };
  lokasi:      { nilai: number; maks: number; label: string };
  nilaiProyek: { nilai: number; maks: number; label: string };
  timing:      { nilai: number; maks: number; label: string };
  total:       number;
}

export interface OutreachEmail {
  subjek: string;
  kepada: string;
  isi:    string;
}

export interface OutreachLead {
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
  scoreBreakdown: ScoreBreakdown;
  pic:            { nama: string; jabatan: string; email: string; telepon: string };
  email:          OutreachEmail;
  dibuatPada:     string;
}

export interface OutreachFile {
  dibuatPada:      string;
  totalLeads:      number;
  modelDigunakan:  string;
  leads:           OutreachLead[];
}

export function getOutreach(): OutreachFile {
  const file = path.join(OUTPUT_DIR, "outreach.json");
  if (!existsSync(file)) return { dibuatPada: "", totalLeads: 0, modelDigunakan: "", leads: [] };
  return JSON.parse(readFileSync(file, "utf-8")) as OutreachFile;
}
