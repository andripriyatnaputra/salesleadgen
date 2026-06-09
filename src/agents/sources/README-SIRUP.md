# SIRUP Agent

Agent untuk scraping data paket pengadaan dari **SIRUP** (Sistem Informasi Rencana Umum Pengadaan) di https://sirup.inaproc.id

## Tentang SIRUP

SIRUP adalah platform publik yang dikelola oleh LKPP (Lembaga Kebijakan Pengadaan Barang/Jasa Pemerintah) yang berisi Rencana Umum Pengadaan (RUP) dari seluruh K/L/D/I di Indonesia. Data di SIRUP adalah **perencanaan tender** yang akan dilaksanakan dalam tahun anggaran berjalan.

**Perbedaan SIRUP vs LPSE:**
- **SIRUP**: Rencana umum pengadaan (planning stage) — paket yang *akan* dilaksanakan
- **LPSE**: Tender yang sedang/sudah berjalan (execution stage) — paket yang *sedang* dilelang

## Endpoint

- **Base URL**: `https://sirup.inaproc.id`
- **Search Endpoint**: `/sirup/caripaketctr/search` (POST)
- **Landing Page**: `/sirup/caripaketctr/index`

## Strategi Scraping

### 1. Cookie Session
SIRUP memerlukan cookie session dari landing page sebelum melakukan pencarian:

```typescript
// Ambil cookie dari halaman index
GET /sirup/caripaketctr/index
→ Set-Cookie: ci_session=xxx; PHPSESSID=yyy

// Gunakan cookie untuk search
POST /sirup/caripaketctr/search
Headers: Cookie: ci_session=xxx; PHPSESSID=yyy
```

### 2. POST Search Parameters

```
tahun: 2026
keyword: "jaringan komputer"
page: 1
length: 50
```

### 3. Response Format

API mengembalikan JSON dengan struktur:
```json
{
  "data": [
    {
      "nama_paket": "Pengadaan Jaringan Komputer",
      "satker_nama": "Dinas Komunikasi Kab. Bandung",
      "klpd_nama": "Pemerintah Kab. Bandung",
      "pagu": 500000000,
      "tahun_anggaran": 2026,
      "metode_pengadaan": "Tender",
      "id": "12345"
    }
  ]
}
```

### 4. HTML Fallback

Jika API gagal (403/CAPTCHA/blocking), agent otomatis fallback ke HTML scraping:

```typescript
GET /sirup/caripaketctr/index?tahun=2026&keyword=jaringan&page=1
→ Parse tabel HTML hasil pencarian
```

## Filter & Klasifikasi

### Filter IT-Relevant
Hanya ambil paket yang mengandung keyword:
- jaringan, internet, wifi, fiber optik
- software, aplikasi, sistem informasi
- server, hardware komputer, IT infrastructure
- CCTV, cybersecurity, cloud

### Nilai Minimum
Hanya paket dengan pagu **≥ Rp 100 juta**

### Klasifikasi Kebutuhan
| Pattern | Kebutuhan |
|---------|-----------|
| jaringan\|lan\|wan\|fiber\|wifi | `jaringan` |
| software\|aplikasi\|erp\|sistem informasi | `software` |
| server\|komputer\|hardware\|datacenter | `it-infrastructure` |
| cctv\|kamera\|surveillance | `cctv` |
| cloud\|hosting\|saas | `cloud` |
| firewall\|cybersecurity | `cybersecurity` |

## Keywords Pencarian

```typescript
const KEYWORDS_IT = [
  "jaringan komputer",
  "teknologi informasi",
  "sistem informasi",
  "software",
  "aplikasi",
  "server",
  "internet",
  "telekomunikasi",
  "fiber optik",
  "CCTV",
  "cloud",
  "cybersecurity",
  "infrastruktur IT",
  "hardware komputer",
];
```

## Rate Limiting

- **Delay antar request**: 2500ms (2.5 detik)
- **Max pages per keyword**: 3 halaman (150 paket)
- **Items per page**: 50 paket

## Error Handling

### 403 Forbidden
→ CAPTCHA atau IP blocking aktif
→ Fallback ke HTML scraping atau skip

### DNS Resolution Failed (ENOTFOUND)
→ Normal di WSL/sandbox environment
→ Will work in production server

### Empty Response
→ Try HTML fallback
→ Log dan lanjut ke keyword berikutnya

## Output Format

Agent menghasilkan array of `Lead`:

```typescript
{
  id: "sirup-1-pengadaan-jaringan-kompu",
  sumber: "LPSE", // SIRUP bagian dari ekosistem LPSE
  url: "https://sirup.inaproc.id/sirup/ro/paket/12345",
  namaProyek: "Pengadaan Jaringan Komputer",
  namaPerusahaan: "Pemerintah Kab. Bandung",
  industri: "Pemerintah",
  lokasi: "Bandung",
  nilaiProyek: 500000000,
  kebutuhan: "jaringan",
  deskripsiKebutuhan: "[SIRUP 2026] Tender: Pengadaan Jaringan Komputer | Satker: Dinas Komunikasi",
  // ... fields lainnya
}
```

## Integrasi dengan Pipeline

Agent dipanggil di [index.ts](../../index.ts):

```typescript
import { fetchSirupPackages } from "./agents/sources/sirupAgent.js";

const sirupLeads = await fetchSirupPackages();
```

## Testing

```bash
# Compile TypeScript
npx tsc

# Run pipeline (akan include SIRUP agent)
npx ts-node src/index.ts
```

## Catatan Penting

1. **SIRUP adalah planning stage** — paket belum tentu jadi tender
2. **Kombinasi SIRUP + LPSE** memberikan gambaran lengkap: planning → execution
3. **Cookie requirement** — pastikan get session sebelum search
4. **WSL/Sandbox DNS** — error ENOTFOUND normal di development, akan work di production
5. **Deduplikasi** — gunakan `namaPaket + instansi` sebagai unique key

## Troubleshooting

### Tidak ada hasil
- Cek koneksi internet
- Cek apakah SIRUP sedang maintenance
- Coba akses manual di browser: https://sirup.inaproc.id

### 403 Forbidden berulang
- SIRUP mendeteksi bot traffic
- Gunakan proxy/VPN
- Tambah delay lebih lama (5-10 detik)
- Pertimbangkan headless browser (Puppeteer/Playwright)

### Data tidak sesuai ICP
- Sesuaikan `KEYWORDS_IT` di agent
- Update filter industri di `guessIndustri()`
- Tambah exclude keywords jika banyak false positive

## Referensi

- SIRUP Portal: https://sirup.inaproc.id
- LKPP: https://www.lkpp.go.id
- LPSE Agent: [lpseAgent.ts](./lpseAgent.ts)
