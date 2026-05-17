import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pool } from "../src/config/database.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log("[Migration] Starting database migration...");

  try {
    // Read schema SQL file
    const schemaPath = join(__dirname, "schema.sql");
    const schemaSql = readFileSync(schemaPath, "utf-8");

    // Execute schema
    console.log("[Migration] Executing schema.sql...");
    await pool.query(schemaSql);

    console.log("[Migration] ✅ Migration completed successfully!");

    // Test queries
    console.log("\n[Migration] Running test queries...");

    const tableCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('raw_leads', 'processed_leads', 'outreach_emails', 'scraping_runs')
      ORDER BY table_name
    `);

    console.log("\n[Migration] Tables created:");
    tableCheck.rows.forEach((row) => {
      console.log(`  ✓ ${row.table_name}`);
    });

    const viewCheck = await pool.query(`
      SELECT table_name as view_name
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name IN ('v_leads_summary', 'v_qualified_leads')
      ORDER BY table_name
    `);

    console.log("\n[Migration] Views created:");
    viewCheck.rows.forEach((row) => {
      console.log(`  ✓ ${row.view_name}`);
    });

    // Show sample queries
    console.log("\n[Migration] Sample queries:");
    console.log("  - SELECT * FROM v_leads_summary;");
    console.log("  - SELECT * FROM v_qualified_leads WHERE qualifier_score >= 70;");
    console.log("  - SELECT source, COUNT(*) FROM raw_leads GROUP BY source;");
    console.log("  - SELECT industri, COUNT(*), SUM(nilai_proyek) FROM raw_leads GROUP BY industri;");

  } catch (error) {
    console.error("[Migration] ❌ Error:", error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log("\n[Migration] Database connection closed.");
  }
}

migrate();
