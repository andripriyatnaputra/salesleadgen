import { NextResponse } from "next/server";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL ||
  "postgres://sales:sales123@localhost:5432/salesdb?sslmode=disable";

const pool = new Pool({
  connectionString: DATABASE_URL.replace("postgres://", "postgresql://"),
  max: 5,
});

export async function GET() {
  try {
    // Get all raw leads from database
    const result = await pool.query(`
      SELECT
        id,
        lead_id,
        source as sumber,
        url,
        nama_proyek as "namaProyek",
        nama_perusahaan as "namaPerusahaan",
        industri,
        lokasi,
        nilai_proyek as "nilaiProyek",
        deadline,
        kebutuhan,
        deskripsi_kebutuhan as deskripsi,
        status,
        created_at as "createdAt"
      FROM raw_leads
      WHERE status = 'active'
      ORDER BY created_at DESC
    `);

    const leads = result.rows.map((row, index) => ({
      no: index + 1,
      ...row,
    }));

    return NextResponse.json({
      total: leads.length,
      leads,
    });
  } catch (error) {
    console.error("Error fetching from database:", error);

    // Fallback to JSON file
    try {
      const { readFile } = await import("fs/promises");
      const { join } = await import("path");

      const projectRoot = join(process.cwd(), "..");
      const rawLeadsPath = join(projectRoot, "src", "output", "raw-leads.json");
      const content = await readFile(rawLeadsPath, "utf-8");
      const data = JSON.parse(content);

      return NextResponse.json(data);
    } catch (fileError) {
      return NextResponse.json(
        { total: 0, leads: [] },
        { status: 200 }
      );
    }
  }
}
