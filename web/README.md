# Starcom LeadGen Dashboard

Dashboard web untuk menjalankan agent lead generation secara manual dan terkontrol.

## Fitur

- **Dashboard Agent**: Pilih agent mana yang ingin dijalankan
- **Scraping Agents**: Pengadaan.com, CIVD SKK Migas, PAM Jaya, KAI RAPID
- **Processing Agents**: Classifier, Qualifier, Outreach
- **Real-time Progress**: Monitor progress agent yang sedang berjalan
- **Raw Leads**: Lihat semua hasil scraping
- **Outreach**: Lihat email draft yang sudah di-generate

## Cara Menjalankan

1. Install dependencies (jika belum):
```bash
npm install
```

2. Jalankan development server:
```bash
npm run dev
```

3. Buka browser di: [http://localhost:3100](http://localhost:3100)

## Struktur Menu

- **Dashboard** (`/dashboard`): Pilih dan jalankan agent
- **Raw Leads** (`/raw-leads`): Hasil scraping semua tender
- **Outreach** (`/outreach`): Email draft yang sudah di-generate

## Cara Menggunakan Dashboard

1. Pilih agent yang ingin dijalankan:
   - **Scraping Agents**: Untuk mengambil data tender baru
   - **Processing Agents**: Untuk memproses data yang sudah ada

2. Klik "Jalankan Agent" untuk memulai

3. Monitor progress di log console

## Rekomendasi Urutan

### Untuk Lead Baru (Pertama Kali)
1. Pilih semua **Scraping Agents** → Jalankan
2. Tunggu selesai, lalu pilih **Classifier** → Jalankan
3. Pilih **Qualifier** → Jalankan
4. Pilih **Outreach** → Jalankan

### Untuk Update Data Sumber Tertentu
Pilih hanya scraping agent yang dibutuhkan (misal: hanya Pengadaan.com)

### Untuk Re-score atau Re-generate Email
Pilih hanya Processing Agents yang dibutuhkan

## Environment Variables

Pastikan `.env` sudah diisi di root project:
```
ANTHROPIC_API_KEY=your_key_here
```

## Port

Dashboard berjalan di port **3100** untuk menghindari konflik dengan project lain.
