import type { Lead, KategoriKebutuhan } from "../../config/claude.js";

/**
 * Parser untuk SKK MIGAS Procurement List format text
 *
 * Format: No | KKKS | NDP | Tender Title | Expected Invitation Date | Currency | Estimated Value | Minimum TKDN
 */

// ─── Konfigurasi ──────────────────────────────────────────────────────────────

const IT_KEYWORDS = [
  "jaringan", "network", "internet", "telekomunikasi", "fiber",
  "wifi", "vsat", "bandwidth", "radio", "komunikasi data",
  "sistem informasi", "aplikasi", "software", "perangkat lunak",
  "it ", " it,", " it.", "teknologi informasi", "tik",
  "server", "komputer", "hardware", "perangkat keras", "datacenter",
  "cloud", "hosting", "virtualisasi",
  "cctv", "kamera", "surveillance", "access control", "monitoring",
  "scada", "iot", "sensor", "monitoring system", "instrumentasi",
  "integrasi sistem", "erp", "sap", "oracle", "microsoft",
  "cyber", "security", "keamanan", "firewall",
  "load balancer", "switch", "router", "access point",
  "storage", "backup", "disaster recovery",
  "database", "sql", "crm",
];

// Keywords yang MENOLAK tender (false positive)
const EXCLUDE_KEYWORDS = [
  "permit", "amdal", "andal", "ukl", "upl", "izin lingkungan",
  "drilling", "pengeboran", "sumur", "well", "rig",
  "piping", "pipa", "pipeline",
  "civil work", "konstruksi sipil", "bangunan",
  "mechanical", "mekanik", "rotating equipment",
  "electrical non-it", "kelistrikan",
  "catering", "katering", "konsumsi",
  "transportasi", "kendaraan", "mobil", "truk",
  "chemical", "kimia", "bahan kimia",
  "medis non-it", "alat kesehatan", "medical service",
  "safety equipment", "alat k3", "apd",
  "housekeeping", "cleaning service",
  "satpam", "tenaga kerja bantu pengamanan", "jasa pengamanan",
  "security service for", // "security service for [operational]" = guard, bukan CCTV
  "boat", "kapal", "vessel", "crew boat", "tug boat", "utility boat",
  "charter", "sewa kapal", "offshore vessel",
  "workover", "coiled tubing", "fracturing",
  "rock bit", "drill bit",
  "h2s monitoring", "gas monitoring", "environmental monitoring",
  "desalination", "water treatment plant",
  "gas recovery system", "gas asso recovery",
  "cargo carrying", "cargo unit",
  "sewa menyewa lantai", "rental office", "sewa ruang",
  "hr personnel", "human resource", "hr&it personnel",
  "storage tank", "oil storage", "water tank", "tangki", "tanker",
  "floating storage", "offloading", "lay up",
];

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ProcurementEntry {
  no: number;
  kkks: string;
  ndp: string;
  tenderTitle: string;
  expectedInvitationDate: string;
  currency: string;
  estimatedValue: number;
  minimumTkdn: number;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function shouldExclude(text: string): boolean {
  const t = text.toLowerCase();
  return EXCLUDE_KEYWORDS.some((kw) => t.includes(kw));
}

function isITRelevant(text: string): boolean {
  const t = text.toLowerCase();

  // Jika ada keyword exclude, tolak langsung
  if (shouldExclude(t)) return false;

  // Cek apakah ada keyword IT
  return IT_KEYWORDS.some((kw) => t.includes(kw));
}

function isDateValid(dateStr: string): boolean {
  if (!dateStr || !dateStr.trim()) return true; // Jika tidak ada tanggal, assume valid (belum ada tender)

  try {
    // Parse tanggal Indonesia: "15 Maret 2026" atau "15/03/2026"
    const bulanMap: Record<string, number> = {
      januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
      juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
    };

    let targetDate: Date | null = null;

    // Format: "15 Maret 2026"
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

    // Format: "15/03/2026" atau "2026-03-15"
    if (!targetDate) {
      targetDate = new Date(dateStr);
    }

    if (!targetDate || isNaN(targetDate.getTime())) {
      return true; // Jika tidak bisa parse, assume valid
    }

    // Ambil tanggal hari ini dan set ke awal bulan
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Ambil bulan dari target date
    const targetMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);

    // Tolak jika bulan lampau (sebelum bulan berjalan)
    return targetMonth >= currentMonth;
  } catch {
    return true; // Jika error, assume valid
  }
}

function guessKebutuhan(title: string): KategoriKebutuhan {
  const t = title.toLowerCase();
  if (/jaringan|network|wifi|fiber|vsat|internet|telekomunikasi|bandwidth|radio|komunikasi/.test(t)) return "jaringan";
  if (/server|hardware|komputer|laptop|datacenter|perangkat keras/.test(t)) return "it-infrastructure";
  if (/cctv|kamera|surveillance|access control|monitoring/.test(t)) return "cctv";
  if (/scada|iot|sensor|monitoring system|instrumentasi/.test(t)) return "sistem-integrasi";
  if (/integrasi|erp|sap|oracle|middleware|microsoft/.test(t)) return "sistem-integrasi";
  if (/cloud|hosting|vps|virtualisasi/.test(t)) return "cloud";
  if (/cyber|security|keamanan|firewall/.test(t)) return "it-infrastructure";
  return "software";
}

function parseValue(valueStr: string): number {
  // Contoh: "1,500,000.00" atau "1.500.000,00"
  // Hapus semua koma dan titik kecuali 2 digit terakhir
  const cleaned = valueStr.replace(/[^\d.,-]/g, "");

  // Jika ada koma sebagai desimal (format Indonesia)
  if (cleaned.includes(",") && cleaned.lastIndexOf(",") > cleaned.length - 4) {
    return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  }

  // Format US (titik sebagai desimal)
  return parseFloat(cleaned.replace(/,/g, ""));
}

function parseTkdn(tkdnStr: string): number {
  const match = tkdnStr.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// ─── Parse dari Text Format ───────────────────────────────────────────────────

/**
 * Parse procurement list dari format text yang di-extract dari PDF
 *
 * Format per baris:
 * No | KKKS | NDP | Tender Title | Expected Invitation Date | Currency | Estimated Value | Minimum TKDN
 */
export function parseProcurementText(content: string): ProcurementEntry[] {
  const lines = content.split("\n");
  const entries: ProcurementEntry[] = [];

  for (const line of lines) {
    // Skip header, empty lines, dan metadata lines
    if (!line.trim() ||
        line.includes("SKK MIGAS") ||
        line.includes("Procurement List") ||
        line.includes("Page ") ||
        line.includes("Expected Invitation") ||
        line.includes("---") ||
        line.match(/^\d+\s+of\s+\d+/)) {
      continue;
    }

    // Split by pipe |
    const parts = line.split("|").map(p => p.trim());

    // Harus ada minimal 8 kolom
    if (parts.length < 8) continue;

    const no = parseInt(parts[0], 10);
    if (isNaN(no) || no <= 0) continue; // Skip jika no tidak valid

    const entry: ProcurementEntry = {
      no,
      kkks: parts[1] || "",
      ndp: parts[2] || "",
      tenderTitle: parts[3] || "",
      expectedInvitationDate: parts[4] || "",
      currency: parts[5] || "IDR",
      estimatedValue: parseValue(parts[6] || "0"),
      minimumTkdn: parseTkdn(parts[7] || "0"),
    };

    entries.push(entry);
  }

  return entries;
}

/**
 * Parse dari raw text procurement list (format yang lebih flexible)
 * Untuk handle text extract yang kurang terstruktur
 */
export function parseProcurementRawText(content: string): ProcurementEntry[] {
  const lines = content.split("\n");
  const entries: ProcurementEntry[] = [];
  let currentEntry: Partial<ProcurementEntry> = {};
  let lineBuffer = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip kosong
    if (!line) {
      if (lineBuffer && currentEntry.no) {
        // Flush current entry
        if (currentEntry.tenderTitle && currentEntry.kkks) {
          entries.push(currentEntry as ProcurementEntry);
        }
        currentEntry = {};
        lineBuffer = "";
      }
      continue;
    }

    // Deteksi nomor entry baru
    const noMatch = line.match(/^(\d+)\s+/);
    if (noMatch) {
      // Flush previous
      if (currentEntry.no && currentEntry.tenderTitle) {
        entries.push(currentEntry as ProcurementEntry);
      }

      currentEntry = {
        no: parseInt(noMatch[1], 10),
        kkks: "",
        ndp: "",
        tenderTitle: "",
        expectedInvitationDate: "",
        currency: "IDR",
        estimatedValue: 0,
        minimumTkdn: 0,
      };
      lineBuffer = line;
    } else {
      lineBuffer += " " + line;
    }
  }

  // Flush last entry
  if (currentEntry.no && currentEntry.tenderTitle) {
    entries.push(currentEntry as ProcurementEntry);
  }

  return entries;
}

// ─── Konversi ke Lead Format ──────────────────────────────────────────────────

export function procurementToLead(entry: ProcurementEntry): Lead {
  const url = `https://civd.skkmigas.go.id/index.jwebs#proclist`;

  const deskripsi = [
    `KKKS: ${entry.kkks}`,
    `NDP: ${entry.ndp}`,
    `Procurement List 2026`,
    entry.currency && entry.estimatedValue > 0
      ? `Estimasi: ${entry.currency} ${entry.estimatedValue.toLocaleString("id-ID")}`
      : "",
    entry.minimumTkdn > 0 ? `TKDN Min: ${entry.minimumTkdn}%` : "",
  ].filter(Boolean).join(" | ");

  return {
    id: `civd-proclist-2026-${entry.no}`,
    sumber: "CIVD",
    url,
    namaProyek: entry.tenderTitle,
    namaPerusahaan: entry.kkks || "SKK Migas / Operator Migas",
    industri: "Migas",
    lokasi: "Indonesia (Migas)",
    nilaiProyek: entry.estimatedValue,
    deadline: entry.expectedInvitationDate,
    kebutuhan: guessKebutuhan(entry.tenderTitle),
    deskripsiKebutuhan: deskripsi,
    pic: {
      nama: "",
      jabatan: "Panitia Pengadaan",
      email: "",
      telepon: "",
    },
    score: 0,
    prioritas: "rendah",
    alasanScore: "",
    tanggalDitemukan: new Date().toISOString(),
  };
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

/**
 * Parse procurement list dari file text dan konversi ke Lead[]
 * Filter hanya yang relevan dengan IT/bidang Starcom dan tanggal masih valid
 */
export function processProcurementList(
  content: string,
  filterIT: boolean = true
): Lead[] {
  console.log("[CIVD Procurement Parser] Memulai parsing...");

  // Coba parse format pipe-delimited dulu
  let entries = parseProcurementText(content);

  // Jika gagal atau sedikit, coba parser raw text
  if (entries.length < 10) {
    console.log("[CIVD Procurement Parser] Format pipe tidak terdeteksi, coba raw text parser...");
    entries = parseProcurementRawText(content);
  }

  console.log(`[CIVD Procurement Parser] Total entries parsed: ${entries.length}`);

  // Filter tanggal: hanya bulan berjalan atau ke depan
  const validDateEntries = entries.filter(e => isDateValid(e.expectedInvitationDate));
  const expiredCount = entries.length - validDateEntries.length;
  if (expiredCount > 0) {
    console.log(
      `[CIVD Procurement Parser] Filter tanggal: ${validDateEntries.length} valid | ` +
      `${expiredCount} bulan lampau dilewati`
    );
  }

  // Filter IT jika diminta
  let filteredEntries = validDateEntries;
  if (filterIT) {
    filteredEntries = validDateEntries.filter(e => isITRelevant(e.tenderTitle));
    console.log(
      `[CIVD Procurement Parser] Filter IT: ${filteredEntries.length} relevan | ` +
      `${validDateEntries.length - filteredEntries.length} non-IT dilewati`
    );
  }

  // Konversi ke Lead
  const leads = filteredEntries.map((entry) => procurementToLead(entry));

  console.log(`[CIVD Procurement Parser] Selesai. ${leads.length} lead dari procurement list.`);
  return leads;
}
