# Website SPA (Single Page Application) - BJB & BPJS

## Issue

Website **Bank BJB** dan **BPJS Ketenagakerjaan** menggunakan JavaScript/SPA untuk load data tender. HTML initial response tidak mengandung data tender - semua di-load via AJAX/API calls.

### Bukti:
- BJB: HTML hanya 2,648 chars, 0 links
- BPJS: HTML 12,486 chars, 0 links

## Solusi

### Opsi 1: Find API Endpoint (Recommended)

**Langkah:**
1. Buka website di browser
2. Buka Developer Tools (F12) → Network tab
3. Reload page dan lihat XHR/Fetch requests
4. Cari request yang return data tender (biasanya JSON)
5. Copy URL endpoint tersebut

**Contoh endpoint yang mungkin:**
```
BJB:
- https://eproc.bankbjb.co.id/api/procurement
- https://eproc.bankbjb.co.id/portal/api/tender/list

BPJS:
- https://eproc.bpjsketenagakerjaan.go.id/api/pengumuman
- https://eproc.bpjsketenagakerjaan.go.id/api/tender/list
```

Setelah dapat endpoint, edit agent file dan update:
```typescript
const API_URL = "https://eproc.bankbjb.co.id/api/tender/list"; // exact endpoint
```

### Opsi 2: Manual Import (Seperti CIVD Procurement List)

**Langkah:**
1. Buka website dan copy data tender ke Excel/CSV
2. Save sebagai text file di `src/data/tender-lists/`
3. Buat parser untuk format tersebut

**Format file:**
```
No | Judul Tender | Nilai | Deadline
1 | Pengembangan Aplikasi Tools Manajemen Risiko | Rp 500.000.000 | 30 Juni 2026
2 | Penetration Test BPJS 2026 | Rp 300.000.000 | 15 Juli 2026
```

### Opsi 3: Headless Browser (Advanced)

Gunakan Puppeteer/Playwright untuk render JavaScript. Ini lebih kompleks dan lambat.

```bash
npm install puppeteer
```

Tapi tidak recommended untuk production karena:
- Lebih lambat (3-5x)
- Consume lebih banyak memory
- Bisa kena rate limit/captcha

## Testing

Untuk test apakah API endpoint work:

```bash
# Test dengan curl
curl -H "Accept: application/json" "https://eproc.bankbjb.co.id/api/tender"

# Atau dengan agent
npm run agents bjb
```

## Next Steps

**Untuk User:**
1. Inspect Network tab di website BJB dan BPJS
2. Berikan API endpoint yang ditemukan
3. Saya akan update agent dengan endpoint yang benar

**Sementara waktu:**
- BJB dan BPJS agents akan return 0 leads
- Gunakan agents lain yang sudah bekerja (CIVD, PAM Jaya, Airnav, KAI)
