// src/agents/sources/test-sirup.ts
// Script untuk testing SIRUP agent secara standalone

import { runSirupAgent } from "./sirupAgent.js";

async function testSirupAgent() {
  console.log("=== Test SIRUP Agent ===\n");
  console.log("Target: https://sirup.inaproc.id");
  console.log("Mode  : Standalone test (tanpa classifier/qualifier)\n");

  try {
    const packages = await runSirupAgent();

    console.log("\n=== Hasil Test ===");
    console.log(`Total paket ditemukan: ${packages.length}`);

    if (packages.length > 0) {
      console.log("\n--- Sample Data (5 pertama) ---");
      packages.slice(0, 5).forEach((pkg, i) => {
        console.log(`\n${i + 1}. ${pkg.namaPaket}`);
        console.log(`   Instansi : ${pkg.klpdNama || pkg.satkerNama}`);
        console.log(`   Pagu     : Rp ${pkg.pagu.toLocaleString('id-ID')}`);
        console.log(`   Metode   : ${pkg.metodePengadaan}`);
        console.log(`   URL      : ${pkg.urlDetail}`);
      });

      // Statistik
      const totalPagu = packages.reduce((sum, p) => sum + p.pagu, 0);
      const avgPagu = totalPagu / packages.length;

      console.log("\n--- Statistik ---");
      console.log(`Total nilai pagu : Rp ${totalPagu.toLocaleString('id-ID')}`);
      console.log(`Rata-rata pagu   : Rp ${Math.round(avgPagu).toLocaleString('id-ID')}`);
      console.log(`Pagu tertinggi   : Rp ${Math.max(...packages.map(p => p.pagu)).toLocaleString('id-ID')}`);
      console.log(`Pagu terendah    : Rp ${Math.min(...packages.map(p => p.pagu)).toLocaleString('id-ID')}`);

      // Breakdown per metode
      const byMetode = packages.reduce((acc, p) => {
        acc[p.metodePengadaan] = (acc[p.metodePengadaan] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log("\n--- Breakdown Metode Pengadaan ---");
      Object.entries(byMetode)
        .sort((a, b) => b[1] - a[1])
        .forEach(([metode, count]) => {
          console.log(`${metode}: ${count} paket`);
        });

      console.log("\n✅ Test berhasil!");
    } else {
      console.log("\n⚠️  Tidak ada data ditemukan.");
      console.log("Kemungkinan:");
      console.log("- SIRUP sedang maintenance");
      console.log("- IP di-block (terlalu banyak request)");
      console.log("- CAPTCHA aktif");
      console.log("- DNS resolution gagal (normal di WSL/sandbox)");
      console.log("\nCoba akses manual: https://sirup.inaproc.id/sirup/caripaketctr/index");
    }

  } catch (error) {
    console.error("\n❌ Test gagal:");
    console.error(error);
  }
}

// Run test
testSirupAgent().catch(console.error);
