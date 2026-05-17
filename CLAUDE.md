# Starcom LeadGen
Sistem lead generation otomatis untuk PT Starcom Solusindo menggunakan Claude AI.

## Tentang Perusahaan
PT. Starcom Solusindo (starcoms.net) — perusahaan IT Solutions berbasis di Bandung yang menyediakan: BWA/WiMAX, jaringan komputer (LAN/WAN), IT infrastructure, cybersecurity, sistem integrasi, CCTV, cloud services, dan software development (custom app, web, mobile, ERP).

## Tujuan
Mengambil data tender dari sumber publik (LPSE, CIVD, Pengadaan.go.id), mengklasifikasikan relevansi, memperkaya data kontak, mengkualifikasi prospek, dan menghasilkan email outreach yang dipersonalisasi.

## Target ICP (Ideal Customer Profile)
- Industri prioritas: Migas, Pertambangan, Pemerintah, BUMN,
  Perbankan, Manufaktur, Kesehatan, Pendidikan
- Lokasi prioritas: remote/terpencil, luar Jawa, kawasan industri
- Kebutuhan: jaringan, IT infra, software, integrasi sistem
- Nilai proyek: minimal Rp 100 juta

## Lead Score Minimum
- Lanjut ke outreach: score >= 70 dari 100
- Output wajib: nama perusahaan, PIC, email, telepon, kebutuhan, score

## Tech Stack
- Runtime: Node.js 18+ / TypeScript
- Model AI: claude-sonnet-4-5
- HTTP: axios + cheerio (scraping)
- Output: JSON + CSV + Google Sheets (opsional)

## Struktur Agent
| Agent | File | Fungsi |
|---|---|---|
| LPSE Agent | `src/agents/sources/lpseAgent.ts` | Scrape tender dari lpse.lkpp.go.id |
| CIVD Agent | `src/agents/sources/civdAgent.ts` | Scrape data vendor dari CIVD |
| Pengadaan Agent | `src/agents/sources/pengadaanAgent.ts` | Scrape dari pengadaan.go.id |
| Classifier | `src/agents/classifierAgent.ts` | Klasifikasi relevansi tender (IT, jaringan, software) |
| Enrichment | `src/agents/enrichmentAgent.ts` | Perkaya data kontak panitia/instansi |
| Qualifier | `src/agents/qualifierAgent.ts` | Skor dan prioritaskan leads |
| Outreach | `src/agents/outreachAgent.ts` | Generate email outreach personal |

## Aturan Kode
- Selalu gunakan TypeScript dengan interface yang jelas
- Semua API key dari .env, tidak boleh hardcode
- Rate limiting wajib: delay 2-3 detik antar request scraping
- Error handling di setiap agent
- Log progress ke console dengan format: [AGENT] pesan
- Hormati robots.txt website sumber

## Menjalankan
```bash
npx ts-node src/index.ts
```

## Environment Variables

Salin `.env` dan isi nilai berikut:

```
ANTHROPIC_API_KEY=your_api_key_here


# Opsional untuk enrichment
HUNTER_API_KEY=your_hunter_key

# Kredensial CIVD Starcom (jika sudah terdaftar)
CIVD_USERNAME=starcom_username
CIVD_PASSWORD=starcom_password```

## Output

Hasil lead dan email tersimpan di `src/output/` (diabaikan oleh git).
