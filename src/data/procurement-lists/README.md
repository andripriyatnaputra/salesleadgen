# CIVD Procurement List Data

Directory ini menyimpan file-file procurement list dari SKK MIGAS CIVD yang sudah di-extract dari PDF atau sumber lainnya.

## Format File

File text dengan format pipe-delimited (|):

```
No | KKKS | NDP | Tender Title | Expected Invitation Date | Currency | Estimated Value | Minimum TKDN
```

### Contoh:

```
1 | Premier Oil Natuna Sea B.V. | 11/NDP/2026 | Pengadaan Jaringan Komunikasi Data | 15 Maret 2026 | IDR | 2500000000 | 40
2 | PT Pertamina Hulu Energi | 12/NDP/2026 | Penyediaan Sistem CCTV dan Monitoring | 20 Maret 2026 | USD | 500000 | 35
```

## Cara Menggunakan

### 1. Menyimpan File Procurement List

Simpan file text procurement list di directory ini, misalnya:
- `procurement-list-2026.txt`
- `SRT-0023_4_Feb_2026_extracted_text.txt`

### 2. Membaca dari Kode

```typescript
import { fetchFromProcurementFile } from './agents/sources/civdAgent.js';

// Baca dan parse procurement list
const leads = await fetchFromProcurementFile(
  './src/data/procurement-lists/procurement-list-2026.txt',
  true  // filterIT = true (hanya ambil yang relevan IT)
);

console.log(`Total leads: ${leads.length}`);
```

### 3. Integrasi dengan Agent Runner

Edit `src/agents-runner.ts` untuk menambahkan source dari procurement file:

```typescript
// Tambahkan di fetchAllLeads()
const civdFileLeads = await fetchFromProcurementFile(
  './src/data/procurement-lists/procurement-list-2026.txt'
);
allRawLeads.push(...civdFileLeads);
```

## Parser

Parser otomatis mendeteksi format:
1. **Pipe-delimited format** (`|` separator) - format standar
2. **Raw text format** - untuk text yang kurang terstruktur

Parser akan:
- Mengekstrak data tender (no, KKKS, judul, tanggal, nilai, TKDN)
- Filter berdasarkan keyword IT/infrastruktur/software
- Konversi ke format Lead standar sistem
- Kategorikan kebutuhan (jaringan, IT infra, CCTV, software, dll)

## Output

Lead yang dihasilkan memiliki:
- `sumber`: "CIVD Procurement List 2026"
- `industri`: "Migas"
- `nilaiProyek`: nilai estimasi dalam rupiah/USD
- `kebutuhan`: kategori otomatis (jaringan, it-infrastructure, cctv, software, dll)
- `score`: 0 (akan di-score oleh Qualifier Agent)

## Notes

- File data tidak di-commit ke git (ada di .gitignore)
- Gunakan nama file yang deskriptif dengan tanggal
- Backup file procurement list yang sudah di-parse
- Minimal nilai proyek Rp 100 juta akan di-prioritaskan oleh Qualifier
