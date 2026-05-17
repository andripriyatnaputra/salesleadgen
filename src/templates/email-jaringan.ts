export function emailJaringan(
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

PT Starcom Solusindo memiliki keahlian khusus dalam solusi jaringan dan telekomunikasi, meliputi:

- Desain dan implementasi jaringan LAN/WAN
- Instalasi fiber optik dan infrastruktur kabel terstruktur
- Solusi WiFi enterprise (Cisco, Ubiquiti, MikroTik)
- Keamanan jaringan dan firewall
- Monitoring dan manajemen jaringan 24/7

Tim engineer kami bersertifikat dan telah menyelesaikan proyek jaringan di berbagai instansi pemerintah dan korporasi.

Kami sangat tertarik untuk berpartisipasi dan siap memberikan solusi terbaik sesuai kebutuhan ${instansi}.

Bolehkah kami mendapatkan kesempatan untuk mempresentasikan kapabilitas kami?

Hormat kami,
Tim Solusi Jaringan
PT Starcom Solusindo
Email: network@starcom.co.id
Telp: (021) 1234-5678`;
}
