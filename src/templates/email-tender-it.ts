export function emailTenderIt(
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

PT Starcom Solusindo adalah perusahaan IT yang berpengalaman dalam pengadaan dan implementasi infrastruktur teknologi informasi untuk instansi pemerintah dan swasta. Kami memiliki rekam jejak yang kuat dalam:

- Pengadaan perangkat keras (server, workstation, perangkat jaringan)
- Implementasi dan konfigurasi sistem
- Dukungan purna jual dan garansi resmi
- Sertifikasi vendor terkemuka (Cisco, HP, Dell, Lenovo)

Kami siap memberikan penawaran kompetitif dengan kualitas terjamin sesuai spesifikasi yang dibutuhkan.

Apakah kami dapat menjadwalkan presentasi singkat untuk mendiskusikan kebutuhan ${instansi}?

Hormat kami,
Tim Pengadaan
PT Starcom Solusindo
Email: procurement@starcom.co.id
Telp: (021) 1234-5678`;
}
