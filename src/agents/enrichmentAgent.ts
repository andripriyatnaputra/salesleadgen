import { claude, MODEL } from "../config/claude.js";
import type { Lead } from "../config/claude.js";

// Mengisi field pic (nama, jabatan, email, telepon) pada Lead
// menggunakan Claude untuk menebak kontak berdasarkan nama instansi + paket.

interface PicGuess {
  nama:     string;
  jabatan:  string;
  email:    string;
  telepon:  string;
}

function fallbackPic(namaPerusahaan: string): PicGuess {
  const domain = namaPerusahaan
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "");
  return {
    nama:    "",
    jabatan: "Pejabat Pengadaan",
    email:   `pengadaan@${domain}.go.id`,
    telepon: "",
  };
}

export async function enrichLeads(leads: Lead[]): Promise<Lead[]> {
  console.log(`[Enrichment Agent] Mengisi data kontak untuk ${leads.length} lead...`);

  const enriched: Lead[] = [];

  for (const lead of leads) {
    try {
      const message = await claude.messages.create({
        model:      MODEL,
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content:
              `Tebak kontak PIC pengadaan IT di instansi ini:\n` +
              `Instansi: "${lead.namaPerusahaan}"\n` +
              `Paket: "${lead.namaProyek}"\n\n` +
              `Jawab JSON: {"nama":"","jabatan":"Pejabat Pengadaan","email":"...@....go.id","telepon":""}\n` +
              `Gunakan email format pengadaan@<singkatan-instansi>.go.id jika tidak diketahui.`,
          },
        ],
      });

      const raw  = message.content[0]?.type === "text" ? message.content[0].text : "{}";
      const text = raw.match(/\{[\s\S]*?\}/)?.[0] ?? "{}";
      const pic  = JSON.parse(text) as PicGuess;

      enriched.push({
        ...lead,
        pic: {
          nama:    pic.nama    ?? "",
          jabatan: pic.jabatan ?? "Pejabat Pengadaan",
          email:   pic.email   ?? fallbackPic(lead.namaPerusahaan).email,
          telepon: pic.telepon ?? "",
        },
      });
    } catch {
      enriched.push({ ...lead, pic: fallbackPic(lead.namaPerusahaan) });
    }
  }

  console.log(`[Enrichment Agent] Selesai.`);
  return enriched;
}
