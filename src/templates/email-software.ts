export function emailSoftware(
  namaKontak: string,
  namaTender: string,
  instansi: string
): string {
  return `Yth. ${namaKontak}
Pejabat Pengadaan / Panitia Tender
${instansi}

Dengan hormat,

Kami dari PT Starcom Solusindo ingin menyampaikan penawaran terkait tender:
"${namaTender}"

PT Starcom Solusindo menyediakan layanan pengembangan dan implementasi perangkat lunak, antara lain:

- Pengembangan sistem informasi manajemen custom
- Implementasi ERP, HRIS, dan aplikasi korporat
- Pengembangan aplikasi web dan mobile
- Integrasi sistem dan API
- Migrasi data dan digitalisasi proses bisnis

Kami mengutamakan solusi yang sesuai dengan regulasi SPSE dan standar keamanan pemerintah. Produk kami telah digunakan oleh lebih dari 50 instansi di seluruh Indonesia.

Kami berharap dapat mendiskusikan kebutuhan pengembangan sistem ${instansi} lebih lanjut.

Hormat kami,
Tim Solusi Perangkat Lunak
PT Starcom Solusindo
Email: software@starcom.co.id
Telp: (021) 1234-5678`;
}
