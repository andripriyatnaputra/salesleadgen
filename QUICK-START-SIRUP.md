# Quick Start: SIRUP Agent

Panduan cepat untuk menggunakan SIRUP agent yang baru ditambahkan.

## 🚀 Running the Agent

### Option 1: Run Full Pipeline (Recommended)

```bash
# Jalankan full pipeline (includes SIRUP + semua agent lain)
npx tsx src/index.ts

# Atau gunakan npm script
npm run dev
```

**Output:**
```
=== Starcom Solusindo — Lead Generation Pipeline ===

Sumber aktif : tender.pengadaan.com, CIVD SKK Migas, PAM Jaya, KAI RAPID, SIRUP

[1/5] Mengambil tender dari semua sumber...
[SIRUP Agent] Mulai — https://sirup.inaproc.id | 14 keywords
[SIRUP Agent] Keyword: "jaringan komputer"
[SIRUP Agent] "jaringan komputer" hal.1 → 12 paket
...
      SIRUP                : 45 leads
      Total unik           : 210 leads

[2/5] Menyimpan raw leads...
      raw-leads.json tersimpan: 210 leads

[3/5] Mengklasifikasikan dengan Claude AI...
      Relevan (score > 0): 180 dari 210

[4/5] Menerapkan ICP scoring...
      Qualified (>= 70): 45 | Semua scored: 180

[5/5] Membuat draft email outreach...
      180 email draft tersimpan.

=== Pipeline Selesai ===
raw-leads.json : 210 leads (... | SIRUP: 45)
outreach.json  : 180 leads (sudah ada score + email draft)
```

### Option 2: Test SIRUP Agent Only (Standalone)

```bash
# Test SIRUP agent secara standalone (tanpa agent lain)
npm run test:sirup

# Atau langsung dengan tsx
npx tsx src/agents/sources/test-sirup.ts
```

**Output:**
```
=== Test SIRUP Agent ===

Target: https://sirup.inaproc.id
Mode  : Standalone test (tanpa classifier/qualifier)

[SIRUP Agent] Mulai — https://sirup.inaproc.id | 14 keywords
[SIRUP Agent] Keyword: "jaringan komputer"
...

=== Hasil Test ===
Total paket ditemukan: 45

--- Sample Data (5 pertama) ---
1. Pengadaan Jaringan Komputer LAN/WAN
   Instansi : Pemerintah Kab. Bandung
   Pagu     : Rp 500.000.000
   Metode   : Tender
   URL      : https://sirup.inaproc.id/sirup/ro/paket/12345

--- Statistik ---
Total nilai pagu : Rp 22.500.000.000
Rata-rata pagu   : Rp 500.000.000

--- Breakdown Metode Pengadaan ---
Tender: 30 paket
E-Purchasing: 10 paket
Pengadaan Langsung: 5 paket

✅ Test berhasil!
```

## 📁 Output Files

Setelah menjalankan pipeline, cek folder [src/output/](src/output/):

```
src/output/
├── raw-leads.json       # Semua leads (belum di-score)
└── outreach.json        # Leads + score + email draft
```

### Sample `raw-leads.json` (SIRUP leads):

```json
{
  "total": 210,
  "leads": [
    {
      "no": 1,
      "namaProyek": "Pengadaan Jaringan Komputer LAN/WAN",
      "namaPerusahaan": "Pemerintah Kab. Bandung",
      "urlTender": "https://sirup.inaproc.id/sirup/ro/paket/12345",
      "industri": "Pemerintah",
      "kebutuhan": "jaringan",
      "nilaiProyek": 500000000,
      "deadline": "",
      "status": "",
      "deskripsi": "[SIRUP 2026] Tender: Pengadaan Jaringan Komputer LAN/WAN | Satker: Dinas Komunikasi"
    }
  ]
}
```

## 🔍 Apa yang Di-scrape oleh SIRUP Agent?

SIRUP agent mencari paket pengadaan dengan **14 keywords IT**:

1. jaringan komputer
2. teknologi informasi
3. sistem informasi
4. software
5. aplikasi
6. server
7. internet
8. telekomunikasi
9. fiber optik
10. CCTV
11. cloud
12. cybersecurity
13. infrastruktur IT
14. hardware komputer

**Filter:**
- ✅ Hanya paket yang relevan dengan IT
- ✅ Nilai pagu minimum: **Rp 100 juta**
- ✅ Tahun anggaran: **2026** (tahun berjalan)

**Pagination:**
- Max 3 halaman per keyword
- 50 paket per halaman
- Total maksimal: ~2,100 paket (14 keywords × 3 pages × 50 items)

## 🎯 SIRUP vs LPSE: Kapan Gunakan?

| Use Case | Agent | Alasan |
|----------|-------|--------|
| Early-stage prospecting | **SIRUP** | Paket masih di planning stage, bisa approach lebih awal |
| Active opportunities | **LPSE** | Tender sedang berjalan, butuh action cepat |
| Long-term pipeline | **SIRUP + LPSE** | Kombinasi: planning + execution stage |

**Recommended**: Gunakan **keduanya** untuk complete pipeline.

## ⚙️ Configuration

### Keywords Customization

Edit [src/agents/sources/sirupAgent.ts](src/agents/sources/sirupAgent.ts#L24-L39):

```typescript
const KEYWORDS_IT = [
  "jaringan komputer",
  "teknologi informasi",
  // ... tambah/edit keyword sesuai kebutuhan
];
```

### Minimum Value

Edit line 41:

```typescript
const NILAI_MINIMUM = 100_000_000; // Rp 100 juta
```

### Pagination Limit

Edit line 42:

```typescript
const MAX_PAGES = 3; // Max 3 halaman per keyword
```

### Rate Limiting

Menggunakan global config dari [src/config/claude.ts](src/config/claude.ts#L20):

```typescript
export const SCRAPE_DELAY_MS = 2500; // 2.5 detik antar request
```

## 🐛 Troubleshooting

### "Unknown file extension .ts"

**Error:**
```
TypeError: Unknown file extension ".ts"
```

**Solusi:**
Gunakan `tsx` bukan `ts-node`:
```bash
# ✅ Correct
npx tsx src/agents/sources/test-sirup.ts

# ❌ Wrong
npx ts-node src/agents/sources/test-sirup.ts
```

Project ini menggunakan ES modules (`"type": "module"` di package.json), sehingga harus menggunakan `tsx`.

### "No data found" / "Unexpected end of JSON input"

**Kemungkinan penyebab:**
1. SIRUP endpoint mengembalikan response kosong
2. SIRUP sedang maintenance
3. IP address di-block (terlalu banyak request)
4. CAPTCHA aktif
5. Endpoint SIRUP berubah

**Solusi:**
```bash
# Cek manual di browser
# Buka: https://sirup.inaproc.id/sirup/caripaketctr/index

# Jika bisa diakses manual tapi agent gagal:
# 1. Tambah delay lebih lama (5-10 detik)
# 2. Kurangi MAX_PAGES jadi 1-2
# 3. Pertimbangkan headless browser (Puppeteer)
```

### "DNS failed (ENOTFOUND)"

**Normal di WSL/sandbox environment.** Agent akan bekerja di production server.

Untuk testing di WSL, gunakan agent lain (Pengadaan, CIVD, dll) yang tidak ada DNS issue.

### "HTTP 403 Forbidden"

**CAPTCHA atau bot detection aktif.**

Agent otomatis fallback ke HTML scraping. Jika masih gagal:
- Tunggu beberapa jam (IP cooling period)
- Gunakan proxy/VPN
- Pertimbangkan headless browser

## 📊 Expected Performance

**Runtime:**
- ~1.75 minutes (14 keywords × 3 pages dengan 2.5s delay)
- Bisa lebih cepat jika banyak keyword tidak ada hasil

**Output:**
- **Best case**: 40-150 leads (banyak paket IT tersedia)
- **Average case**: 20-50 leads (moderate availability)
- **Worst case**: 0 leads (SIRUP maintenance/blocking)

**Deduplikasi:**
- Agent otomatis skip duplicate berdasarkan `namaPaket + instansi`
- Cross-agent deduplikasi di pipeline berdasarkan URL

## 🔗 Referensi

- **SIRUP Portal**: https://sirup.inaproc.id/sirup/caripaketctr/index
- **Agent Code**: [src/agents/sources/sirupAgent.ts](src/agents/sources/sirupAgent.ts)
- **Documentation**: [src/agents/sources/README-SIRUP.md](src/agents/sources/README-SIRUP.md)
- **Architecture**: [SIRUP-ARCHITECTURE.txt](SIRUP-ARCHITECTURE.txt)
- **Exercise Guide**: [EXERCISE-SIRUP-AGENT.md](EXERCISE-SIRUP-AGENT.md)

## 💡 Pro Tips

### 1. Kombinasi dengan LPSE
```typescript
// Di index.ts sudah terintegrasi
const [pengadaanLeads, ..., lpseLeads, sirupLeads] = await Promise.all([
  fetchPengadaanTenders(),
  ...
  fetchLpseTenders(),    // Active tenders
  fetchSirupPackages(),  // Planned packages
]);
```

### 2. Monitoring Hasil
```bash
# Cek raw leads
cat src/output/raw-leads.json | jq '.leads[] | select(.sumber == "SIRUP")'

# Hitung total SIRUP leads
cat src/output/raw-leads.json | jq '[.leads[] | select(.sumber == "SIRUP")] | length'
```

### 3. Export ke CSV
```bash
# Gunakan jq untuk convert JSON to CSV
cat src/output/raw-leads.json | jq -r '.leads[] | [.namaProyek, .namaPerusahaan, .nilaiProyek] | @csv' > sirup-leads.csv
```

---

**Need help?** Check:
1. [README-SIRUP.md](src/agents/sources/README-SIRUP.md) - Detailed documentation
2. [EXERCISE-SIRUP-AGENT.md](EXERCISE-SIRUP-AGENT.md) - Implementation guide
3. [SIRUP-ARCHITECTURE.txt](SIRUP-ARCHITECTURE.txt) - Visual architecture
