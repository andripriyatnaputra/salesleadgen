import { NextResponse } from "next/server";
import pkg from "pg";
const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL ||
  "postgres://sales:sales123@localhost:5433/salesdb?sslmode=disable";

const pool = new Pool({
  connectionString: DATABASE_URL,
});

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        id,
        lead_id,
        source,
        url,
        nama_proyek,
        nama_perusahaan,
        industri,
        lokasi,
        nilai_proyek,
        deadline,
        kebutuhan,
        deskripsi_kebutuhan,
        pic_nama,
        pic_jabatan,
        pic_email,
        pic_telepon,
        status,
        created_at,
        updated_at
      FROM raw_leads
      WHERE status = 'active'
      ORDER BY created_at DESC
    `);

    const leads = result.rows.map((row) => ({
      no: row.id,
      leadId: row.lead_id,
      sumber: row.source,
      namaProyek: row.nama_proyek,
      namaPerusahaan: row.nama_perusahaan || "",
      urlTender: row.url || "",
      industri: row.industri || "",
      lokasi: row.lokasi || "",
      kebutuhan: row.kebutuhan || "",
      nilaiProyek: typeof row.nilai_proyek === 'string'
        ? parseInt(row.nilai_proyek, 10)
        : (row.nilai_proyek || 0),
      deadline: row.deadline || "",
      status: row.status || "",
      deskripsi: row.deskripsi_kebutuhan || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({
      total: leads.length,
      leads
    });
  } catch (error) {
    console.error("[API /raw-leads] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch leads from database" },
      { status: 500 }
    );
  }
}
