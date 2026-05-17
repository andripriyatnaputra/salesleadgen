# Cara Menggunakan CIVD Procurement List Parser

## Quick Start

### 1. Simpan File Procurement List

Simpan file text procurement list Anda di folder ini dengan nama:
- `procurement-list-2026.txt` (nama default), atau
- `SRT-0023_4_Feb_2026_extracted_text.txt` (contoh nama spesifik)

### 2. Jalankan Agent

```bash
# Hanya parse procurement list dari file
npm run agents civd-file

# Parse + klasifikasi + scoring
npm run agents civd-file classifier qualifier

# Full pipeline (parse + klasifikasi + scoring + email generation)
npm run agents civd-file classifier qualifier outreach
```

### 3. Cek Output

Hasil tersimpan di `src/output/`:
- `raw-leads.json` - Data mentah setelah parsing
- `qualified-leads.json` - Lead yang sudah di-score (jika pakai qualifier)
- `outreach-emails.json` - Draft email (jika pakai outreach)

## Format File

File text harus dalam format pipe-delimited:

```
No | KKKS | NDP | Tender Title | Expected Invitation Date | Currency | Estimated Value | Minimum TKDN
```

### Contoh Baris Data:

```
1 | Premier Oil Natuna Sea B.V. | 11/NDP/2026 | Pengadaan Jaringan Komunikasi Data | 15 Maret 2026 | IDR | 2500000000 | 40
```

Kolom:
1. **No** - Nomor urut tender
2. **KKKS** - Nama operator migas (Kontraktor Kontrak Kerja Sama)
3. **NDP** - Nomor Daftar Pengadaan
4. **Tender Title** - Judul/nama tender
5. **Expected Invitation Date** - Tanggal expected undangan tender
6. **Currency** - Mata uang (IDR/USD)
7. **Estimated Value** - Nilai estimasi (angka tanpa separator)
8. **Minimum TKDN** - Minimum TKDN requirement (persen)

## Test dengan Sample Data

Sudah tersedia file sample untuk testing:

```bash
# Test dengan data sample (10 entries)
cp sample-procurement-list.txt procurement-list-2026.txt
npx ts-node src/agents-runner.ts civd-file
```

## Filter IT/Software

Parser otomatis filter hanya tender yang relevan dengan bidang Starcom:
- Jaringan & telekomunikasi
- IT infrastructure (server, hardware, datacenter)
- CCTV & surveillance
- Software & aplikasi
- Cloud & virtualisasi
- SCADA, IoT, monitoring
- Cybersecurity
- Sistem integrasi (ERP, SAP, Oracle)

Untuk disable filter (ambil semua tender):

```typescript
// Edit di agents-runner.ts
const leads = await fetchFromProcurementFile(file, false); // false = no filter
```

## Troubleshooting

### File tidak ditemukan
Pastikan file ada di `src/data/procurement-lists/` dengan nama yang benar:
- `procurement-list-2026.txt`, atau
- `SRT-0023_4_Feb_2026_extracted_text.txt`

### Parsing error
Cek format file:
- Setiap baris = 1 tender
- Kolom dipisah dengan pipe `|`
- No header row di tengah-tengah data
- Nilai proyek dalam angka murni (contoh: `2500000000` bukan `2.500.000.000`)

### Hasil parsing sedikit/kosong
- Cek apakah data tender mengandung keyword IT (lihat list filter di atas)
- Atau disable filter IT untuk melihat semua data

## Advanced Usage

### Custom File Path

Edit `src/agents-runner.ts` dan tambahkan path file Anda:

```typescript
const procFiles = [
  "./src/data/procurement-lists/procurement-list-2026.txt",
  "./src/data/procurement-lists/your-custom-file.txt", // tambahkan di sini
];
```

### Programmatic Usage

```typescript
import { fetchFromProcurementFile } from './agents/sources/civdAgent.js';

const leads = await fetchFromProcurementFile(
  './path/to/your/file.txt',
  true  // filterIT
);

console.log(`Loaded ${leads.length} leads`);
```

### Batch Processing

Untuk memproses multiple files:

```typescript
const files = [
  './src/data/procurement-lists/file1.txt',
  './src/data/procurement-lists/file2.txt',
];

const allLeads = [];
for (const file of files) {
  const leads = await fetchFromProcurementFile(file);
  allLeads.push(...leads);
}
```

## Output Lead Format

Setiap lead yang di-parse akan memiliki struktur:

```json
{
  "id": "civd-proclist-2026-1",
  "sumber": "CIVD Procurement List 2026",
  "url": "https://civd.skkmigas.go.id/index.jwebs#proclist",
  "namaProyek": "Pengadaan Jaringan Komunikasi Data",
  "namaPerusahaan": "Premier Oil Natuna Sea B.V.",
  "industri": "Migas",
  "lokasi": "Indonesia (Migas)",
  "nilaiProyek": 2500000000,
  "deadline": "15 Maret 2026",
  "kebutuhan": "jaringan",
  "deskripsiKebutuhan": "KKKS: Premier Oil | NDP: 11/NDP/2026 | Estimasi: IDR 2,500,000,000 | TKDN Min: 40%",
  "pic": {
    "nama": "",
    "jabatan": "Panitia Pengadaan",
    "email": "",
    "telepon": ""
  },
  "score": 0,
  "prioritas": "rendah",
  "alasanScore": "",
  "tanggalDitemukan": "2026-05-15T12:00:00.000Z"
}
```

## Next Steps

Setelah parsing, jalankan agent berikutnya:
1. **Classifier** - Validasi dan enrich klasifikasi kebutuhan
2. **Qualifier** - Scoring dan prioritas berdasarkan ICP Starcom
3. **Outreach** - Generate email personalisasi untuk setiap lead qualified
