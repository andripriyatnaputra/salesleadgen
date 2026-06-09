// src/agents/sources/test-sirup-puppeteer.ts
// Test SIRUP scraping dengan Puppeteer (headless browser)

import puppeteer from "puppeteer";

interface SirupResult {
  namaPaket: string;
  satker: string;
  pagu: string;
  metode: string;
  tahun: string;
}

async function scrapeSirupWithBrowser(keyword: string): Promise<SirupResult[]> {
  console.log(`\n[Puppeteer] Launching browser...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log(`[Puppeteer] Navigating to SIRUP...`);
    await page.goto('https://sirup.inaproc.id/sirup/caripaketctr/index', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    console.log(`[Puppeteer] Page loaded. Searching for "${keyword}"...`);

    // Wait for search input to be available
    await page.waitForSelector('input[type="search"]', { timeout: 10000 });

    // Type keyword into DataTables search box
    await page.type('input[type="search"]', keyword);

    console.log(`[Puppeteer] Waiting for DataTables to load results...`);

    // Wait a bit for DataTables to process
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Wait for table to have data
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    console.log(`[Puppeteer] Extracting data from table...`);

    // Extract data from table
    // @ts-ignore - Code runs in browser context
    const results: SirupResult[] = await page.evaluate(() => {
      // @ts-ignore
      const rows = document.querySelectorAll('table tbody tr');
      const data: any[] = [];

      // @ts-ignore
      rows.forEach((row: any) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 10 && !row.textContent?.includes('No data available')) {
          // SIRUP table columns (verified from screenshot):
          // [0]=No, [1]=Paket, [2]=Pagu(Rp), [3]=Jenis Pengadaan, [4]=Produk Dalam Negeri,
          // [5]=Usaha Kecil/Koperasi, [6]=Metode, [7]=Pemilihan, [8]=K/L/PD,
          // [9]=Satuan Kerja, [10]=Lokasi, [11]=ID
          data.push({
            namaPaket: cells[1]?.textContent?.trim() || '',
            satker: cells[9]?.textContent?.trim() || '',
            pagu: cells[2]?.textContent?.trim() || '',
            metode: cells[6]?.textContent?.trim() || '',
            tahun: '2026',
          });
        }
      });

      return data;
    });

    console.log(`[Puppeteer] Found ${results.length} results`);
    return results;

  } finally {
    await browser.close();
    console.log(`[Puppeteer] Browser closed\n`);
  }
}

async function main() {
  console.log('=== SIRUP Puppeteer Test ===');
  console.log('Target: https://sirup.inaproc.id/sirup/caripaketctr/index');
  console.log('Method: Headless browser (Puppeteer)');
  console.log('Keyword: "Belanja Alat/Bahan" (should have many results)\n');

  try {
    const keyword = 'Belanja Alat/Bahan';
    const results = await scrapeSirupWithBrowser(keyword);

    console.log(`\n=== HASIL ===`);
    console.log(`Total paket ditemukan: ${results.length}\n`);

    if (results.length > 0) {
      console.log(`--- Sample Data (10 pertama) ---\n`);
      results.slice(0, 10).forEach((item, i) => {
        console.log(`${i + 1}. ${item.namaPaket}`);
        console.log(`   Satker: ${item.satker}`);
        console.log(`   Pagu  : ${item.pagu}`);
        console.log(`   Metode: ${item.metode}`);
        console.log(`   Tahun : ${item.tahun}\n`);
      });

      // Statistics
      console.log(`--- Statistik ---`);
      console.log(`Total records : ${results.length}`);
      console.log(`With pagu data: ${results.filter(r => r.pagu && r.pagu !== '').length}`);
      console.log(`With satker   : ${results.filter(r => r.satker && r.satker !== '').length}`);

      console.log(`\n✅ Test BERHASIL dengan Puppeteer!`);
    } else {
      console.log(`⚠️  Tidak ada data ditemukan.`);
      console.log(`Kemungkinan:`);
      console.log(`- Keyword tidak cocok`);
      console.log(`- Table structure berbeda dari expected`);
      console.log(`- Page belum fully loaded`);
    }

  } catch (error) {
    console.error(`\n❌ Error:`, error);
    if (error instanceof Error) {
      console.error(`Message: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
    }
  }
}

main().catch(console.error);
