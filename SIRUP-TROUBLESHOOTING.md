# SIRUP Agent - Troubleshooting Guide

Panduan mengatasi masalah umum saat menggunakan SIRUP Agent.

## 🔧 Error: "Unknown file extension .ts"

### Masalah
```
TypeError: Unknown file extension ".ts" for /home/.../test-sirup.ts
    at Object.getFileProtocolModuleFormat [as file:] ...
  code: 'ERR_UNKNOWN_FILE_EXTENSION'
```

### Penyebab
Project menggunakan ES modules (`"type": "module"` di package.json), sehingga `ts-node` tidak kompatibel.

### Solusi
Gunakan `tsx` bukan `ts-node`:

```bash
# ❌ SALAH - akan error
npx ts-node src/agents/sources/test-sirup.ts

# ✅ BENAR - menggunakan tsx
npx tsx src/agents/sources/test-sirup.ts

# ✅ ATAU gunakan npm script
npm run test:sirup
```

---

## 📡 Error: "Unexpected end of JSON input"

### Masalah
```
[SIRUP Agent] ✗ "jaringan komputer": HTTP — Unexpected end of JSON input
[SIRUP Agent] API gagal, mencoba HTML fallback...
[SIRUP Agent] HTML fallback "jaringan komputer" hal.1 → 0 paket
```

### Penyebab
1. SIRUP endpoint mengembalikan response kosong
2. API endpoint tidak tersedia atau berubah
3. Server SIRUP sedang maintenance
4. Session cookie tidak valid

### Diagnosis
```bash
# Test manual dengan curl
curl -X POST https://sirup.inaproc.id/sirup/caripaketctr/search \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "tahun=2026&keyword=jaringan&page=1&length=50"
```

### Solusi
1. **Cek website manual** - Buka https://sirup.inaproc.id/sirup/caripaketctr/index
   - Jika ada CAPTCHA → tunggu beberapa jam atau gunakan headless browser
   - Jika error 503/maintenance → tunggu hingga server normal

2. **Update endpoint** (jika API berubah):
   Edit [sirupAgent.ts](src/agents/sources/sirupAgent.ts#L8-L9):
   ```typescript
   const BASE_URL = "https://sirup.inaproc.id";
   const SEARCH_ENDPOINT = "/sirup/caripaketctr/search"; // sesuaikan jika berubah
   ```

3. **Gunakan agent lain sementara**:
   ```bash
   # SIRUP tidak tersedia, gunakan agent lain
   # Edit src/index.ts, comment out SIRUP:
   # const sirupLeads = await fetchSirupPackages(); // disabled
   ```

---

## 🚫 Error: "No data found" (0 paket)

### Masalah
```
=== Hasil Test ===
Total paket ditemukan: 0

⚠️  Tidak ada data ditemukan.
```

### Kemungkinan Penyebab
1. ✅ **Normal** - Tidak ada paket IT di SIRUP untuk keyword tertentu
2. ⚠️ **IP Blocking** - Terlalu banyak request dalam waktu singkat
3. ⚠️ **CAPTCHA aktif** - SIRUP mendeteksi bot
4. ⚠️ **Endpoint berubah** - URL atau parameter API berubah
5. ⚠️ **Maintenance** - Server SIRUP sedang down

### Diagnosis Step-by-Step

#### 1. Cek akses manual
```bash
# Buka di browser
https://sirup.inaproc.id/sirup/caripaketctr/index

# Coba search manual dengan keyword "jaringan komputer"
# Apakah ada hasil?
```

**Jika ada hasil di browser tapi agent gagal** → lanjut ke step 2

#### 2. Cek response HTTP
Tambahkan logging sementara di [sirupAgent.ts](src/agents/sources/sirupAgent.ts):

```typescript
// Setelah axios.post
console.log("Response status:", res.status);
console.log("Response headers:", res.headers);
console.log("Response data (first 200 chars):", 
  String(res.data).substring(0, 200)
);
```

Run test lagi:
```bash
npm run test:sirup
```

**Jika response kosong atau HTML bukan JSON** → endpoint berubah atau butuh autentikasi

#### 3. Test dengan delay lebih lama
Edit [claude.ts](src/config/claude.ts#L20):
```typescript
export const SCRAPE_DELAY_MS = 5000; // 5 detik (dari 2.5 detik)
```

#### 4. Kurangi pagination
Edit [sirupAgent.ts](src/agents/sources/sirupAgent.ts#L42):
```typescript
const MAX_PAGES = 1; // dari 3 → test 1 page dulu
```

### Solusi

#### A. Jika IP di-block
```bash
# Tunggu 1-2 jam cooling period
# Atau gunakan proxy/VPN

# Edit agent untuk tambah delay:
# SCRAPE_DELAY_MS = 10000 (10 detik)
```

#### B. Jika CAPTCHA aktif
```bash
# Option 1: Tunggu beberapa jam
# Option 2: Gunakan headless browser (Puppeteer)
# Option 3: Skip SIRUP, gunakan agent lain (LPSE, Pengadaan, CIVD)
```

#### C. Jika endpoint berubah
1. Inspect Network tab di browser DevTools
2. Cari request search saat manual search di SIRUP
3. Perhatikan:
   - URL endpoint baru
   - Headers yang diperlukan
   - Format request body
   - Format response
4. Update `sirupAgent.ts` sesuai temuan

---

## 🌐 DNS Resolution Failed (WSL/Sandbox)

### Masalah
```
[SIRUP Agent] ✗ DNS gagal resolve "sirup.inaproc.id" — normal di WSL/sandbox
```

### Penyebab
- WSL tidak bisa resolve DNS eksternal
- Sandbox/container tidak ada akses internet
- Network configuration issue

### Diagnosis
```bash
# Test DNS resolution
nslookup sirup.inaproc.id

# Test ping
ping sirup.inaproc.id

# Test dengan curl
curl -I https://sirup.inaproc.id
```

### Solusi

#### A. Untuk Development (WSL)
**Ini normal!** Agent akan bekerja di production server.

Untuk testing, gunakan agent lain yang bisa diakses:
```bash
# Test agent lain yang tidak ada DNS issue
npx tsx src/agents/sources/pengadaanAgent.ts  # jika ada test script
```

#### B. Untuk Production
Pastikan server production punya akses internet:
```bash
# Test dari production server
curl -I https://sirup.inaproc.id

# Jika gagal, cek firewall/network config
```

---

## 🔄 Agent Berjalan Tapi Tidak Ada Hasil di Pipeline

### Masalah
```bash
npm run dev
# Output:
#   SIRUP                : 0 leads
#   Total unik           : 150 leads  (dari agent lain)
```

### Diagnosis
```bash
# Test SIRUP standalone
npm run test:sirup

# Jika standalone dapat hasil (>0 paket) tapi pipeline tidak:
# → Kemungkinan deduplikasi atau filter terlalu ketat
```

### Solusi

#### 1. Cek deduplikasi
Edit [index.ts](src/index.ts):
```typescript
// Tambah logging sebelum deduplikasi
console.log(`[DEBUG] SIRUP leads sebelum dedup: ${sirupLeads.length}`);

for (const lead of [...pengadaanLeads, ...civdLeads, ..., sirupLeads]) {
  if (!seen.has(lead.url)) {
    seen.add(lead.url);
    rawLeads.push(lead);
  } else {
    console.log(`[DEBUG] Duplicate skipped: ${lead.namaProyek}`);
  }
}
```

#### 2. Cek nilai minimum
SIRUP filter pagu minimum Rp 100 juta.

Temporary lower untuk test:
```typescript
// Di sirupAgent.ts
const NILAI_MINIMUM = 50_000_000; // temporary: 50 juta untuk test
```

#### 3. Cek IT relevance filter
Tambah keyword atau relaxed filter:
```typescript
// Di sirupAgent.ts, function isRelevant()
function isRelevant(namaPaket: string): boolean {
  const lower = namaPaket.toLowerCase();
  // Temporary: return true untuk test (skip filter)
  return true;
}
```

---

## 📊 Performance: Agent Terlalu Lambat

### Masalah
Agent SIRUP memakan waktu >5 menit.

### Penyebab
- Terlalu banyak keywords (14 keywords × 3 pages × 2.5s delay)
- Network latency tinggi
- Server SIRUP response lambat

### Solusi

#### 1. Kurangi keywords
```typescript
// Di sirupAgent.ts, pilih hanya top keywords
const KEYWORDS_IT = [
  "jaringan komputer",
  "teknologi informasi",
  "server",
  // comment out yang lain untuk test
];
```

#### 2. Kurangi pagination
```typescript
const MAX_PAGES = 1; // dari 3 → 1
```

#### 3. Parallel keyword scraping
**(Advanced)** Edit `runSirupAgent()`:
```typescript
// Scrape beberapa keyword paralel (hati-hati rate limiting!)
const chunks = chunkArray(KEYWORDS_IT, 3); // 3 keywords per batch
for (const chunk of chunks) {
  const results = await Promise.all(
    chunk.map(kw => scrapeSIRUP(kw, 1))
  );
  // ... process results
  await sleep(SCRAPE_DELAY_MS); // delay antar batch
}
```

---

## 📝 Cheat Sheet: Quick Fixes

| Masalah | Quick Fix |
|---------|-----------|
| "Unknown file extension .ts" | Gunakan `tsx` bukan `ts-node` |
| "Unexpected end of JSON input" | Cek endpoint masih aktif, atau skip SIRUP |
| "0 paket ditemukan" | Normal jika tidak ada data IT, atau cek manual di browser |
| "DNS failed" di WSL | Normal, akan work di production |
| Agent terlalu lambat | Kurangi keywords/pages, atau skip sementara |
| IP di-block | Tunggu 1-2 jam, atau tambah delay 10 detik |
| CAPTCHA aktif | Tunggu atau gunakan headless browser |

---

## 🆘 Still Need Help?

### 1. Enable Debug Logging
Edit [sirupAgent.ts](src/agents/sources/sirupAgent.ts):
```typescript
// Tambah di awal scrapeSIRUP()
console.log("[DEBUG] Request:", { keyword, page, cookie: cookie.substring(0, 50) });
console.log("[DEBUG] Response status:", res.status);
console.log("[DEBUG] Response data:", res.data);
```

### 2. Check Documentation
- [README-SIRUP.md](src/agents/sources/README-SIRUP.md) - Technical reference
- [EXERCISE-SIRUP-AGENT.md](EXERCISE-SIRUP-AGENT.md) - Implementation guide
- [QUICK-START-SIRUP.md](QUICK-START-SIRUP.md) - Quick start

### 3. Temporary Workaround
Disable SIRUP agent sementara:

Edit [index.ts](src/index.ts):
```typescript
// Comment out SIRUP
const [pengadaanLeads, civdLeads, pamJayaLeads, kaiLeads /*, sirupLeads*/] = 
  await Promise.all([
    fetchPengadaanTenders(),
    fetchCivdSkkMigas(),
    fetchPamJayaTenders(),
    fetchKaiTenders(),
    // fetchSirupPackages(), // disabled temporarily
  ]);

// Set empty array
const sirupLeads: Lead[] = [];
```

Agent lain (Pengadaan, CIVD, dll) tetap berjalan normal.

---

**Last Updated**: 2026-06-09
