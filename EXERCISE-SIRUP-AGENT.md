# Exercise: Penambahan SIRUP Agent

Dokumentasi lengkap untuk exercise penambahan agent scraping SIRUP (Sistem Informasi Rencana Umum Pengadaan).

## 📋 Ringkasan Exercise

**Tujuan**: Menambahkan agent baru untuk scraping data RUP dari https://sirup.inaproc.id/sirup/caripaketctr/index

**Hasil**:
- ✅ Agent SIRUP baru di [src/agents/sources/sirupAgent.ts](src/agents/sources/sirupAgent.ts)
- ✅ Integrasi dengan pipeline utama di [src/index.ts](src/index.ts)
- ✅ Update tipe data `LeadSource` di [src/config/claude.ts](src/config/claude.ts)
- ✅ Dokumentasi lengkap di [src/agents/sources/README-SIRUP.md](src/agents/sources/README-SIRUP.md)
- ✅ Script test standalone di [src/agents/sources/test-sirup.ts](src/agents/sources/test-sirup.ts)

## 🏗️ Struktur Agent SIRUP

### 1. File Utama: `sirupAgent.ts`

**Exports:**
```typescript
// Interface internal
export interface SirupPackage {
  namaPaket: string;
  satkerNama: string;
  klpdNama: string;
  pagu: number;
  tahunAnggaran: string;
  metodePengadaan: string;
  urlDetail: string;
  tanggalAmbil: string;
}

// Entry point untuk testing
export async function runSirupAgent(): Promise<SirupPackage[]>

// Entry point untuk pipeline (konversi ke Lead[])
export async function fetchSirupPackages(): Promise<Lead[]>
```

### 2. Strategi Scraping

#### A. Cookie Session
```typescript
// 1. Ambil cookie dari landing page
GET /sirup/caripaketctr/index
→ Set-Cookie: ci_session=xxx; PHPSESSID=yyy

// 2. Gunakan cookie untuk search
POST /sirup/caripaketctr/search
Headers: Cookie: ci_session=xxx; PHPSESSID=yyy
Body: tahun=2026&keyword=jaringan+komputer&page=1&length=50
```

#### B. Dual Strategy (API + HTML Fallback)
```typescript
// Try API first
const packages = await scrapeSIRUP(keyword, page);

// If API fails (403/empty), fallback to HTML
if (packages.length === 0) {
  packages = await scrapeSIRUPHTML(keyword, page);
}
```

### 3. Filter & Klasifikasi

**Filter IT-Relevant:**
```typescript
function isRelevant(namaPaket: string): boolean {
  // Cek apakah mengandung keyword IT:
  // jaringan, software, server, CCTV, cloud, dll
}
```

**Klasifikasi Kebutuhan:**
```typescript
function guessKebutuhan(namaPaket: string): KategoriKebutuhan {
  // jaringan → "jaringan"
  // software/aplikasi → "software"
  // server/hardware → "it-infrastructure"
  // cctv → "cctv"
  // cloud → "cloud"
  // firewall/cybersecurity → "cybersecurity"
}
```

**Klasifikasi Industri:**
```typescript
function guessIndustri(namaInstansi: string): IndustriICP {
  // pertamina|migas → "Migas"
  // bank|bri|bni → "Perbankan"
  // rs|rumah sakit → "Kesehatan"
  // universitas|sekolah → "Pendidikan"
  // persero|bumn → "BUMN"
  // default → "Pemerintah"
}
```

## 🔧 Perubahan pada Codebase

### 1. Update Type Definition

**File**: [src/config/claude.ts](src/config/claude.ts)

```diff
- export type LeadSource = "LPSE" | "CIVD" | "PENGADAAN" | ...;
+ export type LeadSource = "LPSE" | "CIVD" | "PENGADAAN" | ... | "SIRUP";
```

### 2. Update Main Pipeline

**File**: [src/index.ts](src/index.ts)

```diff
+ import { fetchSirupPackages } from "./agents/sources/sirupAgent.js";

async function main() {
-   const [pengadaanLeads, civdLeads, ...] = await Promise.all([
+   const [pengadaanLeads, civdLeads, ..., sirupLeads] = await Promise.all([
      fetchPengadaanTenders(),
      fetchCivdSkkMigas(),
      ...
+     fetchSirupPackages(),
    ]);

+   console.log(`      SIRUP                : ${sirupLeads.length} leads`);

    for (const lead of [...pengadaanLeads, ..., sirupLeads]) {
      // deduplikasi
    }
}
```

### 3. Update CLAUDE.md

```diff
## Tujuan
- Mengambil data tender dari sumber publik (LPSE, CIVD, Pengadaan.go.id), ...
+ Mengambil data tender dari sumber publik (LPSE, SIRUP, CIVD, Pengadaan.go.id), ...

## Struktur Agent
| Agent | File | Fungsi |
|---|---|---|
| LPSE Agent | ... | Scrape tender dari lpse.lkpp.go.id |
+ | SIRUP Agent | ... | Scrape RUP dari sirup.inaproc.id |
```

## 🧪 Testing

### 1. Compile TypeScript
```bash
npx tsc --noEmit
```

### 2. Test SIRUP Agent Standalone
```bash
# Gunakan tsx (bukan ts-node) karena project menggunakan ES modules
npx tsx src/agents/sources/test-sirup.ts
```

**Expected Output:**
```
=== Test SIRUP Agent ===

Target: https://sirup.inaproc.id
Mode  : Standalone test (tanpa classifier/qualifier)

[SIRUP Agent] Mulai — https://sirup.inaproc.id | 14 keywords
[SIRUP Agent] Keyword: "jaringan komputer"
[SIRUP Agent] "jaringan komputer" hal.1 → 12 paket
[SIRUP Agent] Keyword: "teknologi informasi"
...

=== Hasil Test ===
Total paket ditemukan: 45

--- Sample Data (5 pertama) ---
1. Pengadaan Jaringan Komputer LAN/WAN
   Instansi : Pemerintah Kab. Bandung
   Pagu     : Rp 500.000.000
   Metode   : Tender
   URL      : https://sirup.inaproc.id/sirup/ro/paket/12345

...

--- Statistik ---
Total nilai pagu : Rp 22.500.000.000
Rata-rata pagu   : Rp 500.000.000
...

✅ Test berhasil!
```

### 3. Test Full Pipeline
```bash
# Gunakan tsx atau npm script
npx tsx src/index.ts

# Atau
npm run dev
```

**Expected Output:**
```
=== Starcom Solusindo — Lead Generation Pipeline ===

Sumber aktif : tender.pengadaan.com, CIVD SKK Migas, PAM Jaya, KAI RAPID, SIRUP

[1/5] Mengambil tender dari semua sumber...
[SIRUP Agent] Mulai — https://sirup.inaproc.id | 14 keywords
...
      SIRUP                : 45 leads
      Total unik           : 210 leads
...
```

## 📝 Catatan Penting

### 1. SIRUP vs LPSE
- **SIRUP**: Planning stage (RUP) — paket yang *akan* dilelang
- **LPSE**: Execution stage — tender yang *sedang* berjalan
- **Kombinasi**: Memberikan early-stage leads (dari SIRUP) + active opportunities (dari LPSE)

### 2. Rate Limiting
```typescript
const SCRAPE_DELAY_MS = 2500; // 2.5 detik antar request
const MAX_PAGES = 3;          // Max 3 halaman per keyword
```

### 3. Error Handling

**403 Forbidden**:
- CAPTCHA aktif
- IP blocking
- → Fallback ke HTML scraping

**DNS Resolution Failed (ENOTFOUND)**:
- Normal di WSL/sandbox
- → Will work in production

**Empty Response**:
- No data for keyword
- → Log dan lanjut keyword berikutnya

### 4. Deduplikasi
```typescript
const key = pkg.namaPaket + "|" + (pkg.klpdNama || pkg.satkerNama);
if (!seen.has(key)) {
  seen.add(key);
  allPackages.push(pkg);
}
```

## 🎯 Best Practices yang Diterapkan

### ✅ 1. Consistency dengan Agent Lain
- Struktur file sama dengan `lpseAgent.ts`, `pengadaanAgent.ts`
- Naming convention: `scrapeSIRUP()`, `runSirupAgent()`, `fetchSirupPackages()`
- Error logging format: `[SIRUP Agent] pesan`

### ✅ 2. Type Safety
```typescript
export interface SirupPackage { ... }
function sirupPackageToLead(pkg: SirupPackage): Lead { ... }
```

### ✅ 3. Dual Strategy (Resilience)
- API first (JSON, lebih bersih)
- HTML fallback (jika API blocked)

### ✅ 4. Rate Limiting
```typescript
await sleep(SCRAPE_DELAY_MS); // Hormati server
```

### ✅ 5. Filter & Deduplikasi
```typescript
if (!isRelevant(namaPaket)) continue;
if (pagu < NILAI_MINIMUM) continue;
if (seen.has(key)) continue;
```

### ✅ 6. Dokumentasi Lengkap
- Inline comments di kode
- README terpisah ([README-SIRUP.md](src/agents/sources/README-SIRUP.md))
- Test script standalone

### ✅ 7. Error Handling yang Informatif
```typescript
if (code === 403) {
  console.log("403 → CAPTCHA atau IP blocking");
} else if (msg.includes("ENOTFOUND")) {
  console.log("DNS gagal → normal di WSL/sandbox");
}
```

## 📚 Referensi

- **SIRUP Agent**: [src/agents/sources/sirupAgent.ts](src/agents/sources/sirupAgent.ts)
- **Dokumentasi SIRUP**: [src/agents/sources/README-SIRUP.md](src/agents/sources/README-SIRUP.md)
- **Test Script**: [src/agents/sources/test-sirup.ts](src/agents/sources/test-sirup.ts)
- **LPSE Agent** (reference): [src/agents/sources/lpseAgent.ts](src/agents/sources/lpseAgent.ts)
- **Pengadaan Agent** (reference): [src/agents/sources/pengadaanAgent.ts](src/agents/sources/pengadaanAgent.ts)

## 🚀 Next Steps (Opsional)

### 1. Headless Browser (jika CAPTCHA blocking)
```typescript
import puppeteer from "puppeteer";

async function scrapeSIRUPWithBrowser() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  // ... solve CAPTCHA, scrape data
}
```

### 2. Proxy Rotation (jika IP blocking)
```typescript
const PROXIES = [
  "http://proxy1:8080",
  "http://proxy2:8080",
];

axios.get(url, {
  proxy: { host: "proxy1", port: 8080 }
});
```

### 3. Detail Page Scraping
```typescript
async function getSirupDetail(packageId: string) {
  // Scrape halaman detail untuk:
  // - Spesifikasi teknis
  // - Kontak panitia
  // - Timeline detail
}
```

### 4. Google Sheets Integration
```typescript
import { google } from "googleapis";

async function exportToSheets(packages: SirupPackage[]) {
  // Export ke Google Sheets untuk monitoring
}
```

---

**Exercise completed!** 🎉

SIRUP Agent berhasil ditambahkan dengan:
- ✅ Dual scraping strategy (API + HTML)
- ✅ Cookie session management
- ✅ IT-relevant filtering
- ✅ Auto-classification (kebutuhan + industri)
- ✅ Full integration dengan pipeline
- ✅ Comprehensive documentation
- ✅ Standalone testing capability
