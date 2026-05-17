import pkg from "pg";
const { Pool } = pkg;
import type { PoolClient, QueryResult } from "pg";

// ─── Database Configuration ───────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL ||
  "postgres://sales:sales123@localhost:5432/salesdb?sslmode=disable";

// Parse connection string
const connectionString = DATABASE_URL.replace("postgres://", "postgresql://");

// Create connection pool
export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on("connect", () => {
  console.log("[Database] Connection established");
});

pool.on("error", (err) => {
  console.error("[Database] Unexpected error:", err);
});

// ─── Query Helpers ────────────────────────────────────────────────────────────

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    console.log("[Database] Query executed", { text: text.slice(0, 50), duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error("[Database] Query error:", { text, error });
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  return await pool.query();
}

// ─── Transaction Helper ───────────────────────────────────────────────────────

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ─── Database Models ──────────────────────────────────────────────────────────

export interface RawLead {
  id?: number;
  lead_id: string;
  source: string;
  url?: string;
  nama_proyek: string;
  nama_perusahaan?: string;
  industri?: string;
  lokasi?: string;
  nilai_proyek?: number;
  deadline?: string;
  kebutuhan?: string;
  deskripsi_kebutuhan?: string;
  pic_nama?: string;
  pic_jabatan?: string;
  pic_email?: string;
  pic_telepon?: string;
  status?: string;
  created_at?: Date;
  updated_at?: Date;
  scraped_at?: Date;
}

export interface ProcessedLead {
  id?: number;
  lead_id: string;
  classifier_category?: string;
  classifier_score?: number;
  classifier_reason?: string;
  qualifier_score?: number;
  qualifier_priority?: string;
  is_qualified?: boolean;
  score_industri?: number;
  score_lokasi?: number;
  score_nilai_proyek?: number;
  score_timing?: number;
  score_breakdown_detail?: any;
  processed_at?: Date;
  classifier_model?: string;
}

export interface OutreachEmail {
  id?: number;
  lead_id: string;
  subject?: string;
  recipient?: string;
  body?: string;
  generated_by?: string;
  generated_at?: Date;
  sent_at?: Date;
  status?: string;
}

export interface ScrapingRun {
  id?: number;
  run_id: string;
  agents: string[];
  total_scraped?: number;
  total_filtered?: number;
  total_saved?: number;
  duration_seconds?: number;
  status?: string;
  error_message?: string;
  started_at?: Date;
  completed_at?: Date;
}

// ─── Lead Repository ──────────────────────────────────────────────────────────

export const LeadRepository = {
  async insertRawLead(lead: RawLead): Promise<number> {
    const result = await query<{ id: number }>(
      `INSERT INTO raw_leads (
        lead_id, source, url, nama_proyek, nama_perusahaan, industri, lokasi,
        nilai_proyek, deadline, kebutuhan, deskripsi_kebutuhan,
        pic_nama, pic_jabatan, pic_email, pic_telepon, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (lead_id) DO NOTHING
      RETURNING id`,
      [
        lead.lead_id,
        lead.source,
        lead.url,
        lead.nama_proyek,
        lead.nama_perusahaan,
        lead.industri,
        lead.lokasi,
        lead.nilai_proyek || 0,
        lead.deadline,
        lead.kebutuhan,
        lead.deskripsi_kebutuhan,
        lead.pic_nama,
        lead.pic_jabatan,
        lead.pic_email,
        lead.pic_telepon,
        lead.status || "active",
      ]
    );
    return result.rows[0].id;
  },

  async bulkInsertRawLeads(leads: RawLead[]): Promise<number> {
    if (leads.length === 0) return 0;

    const values: any[] = [];
    const placeholders: string[] = [];

    leads.forEach((lead, i) => {
      const offset = i * 16;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5},
          $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10},
          $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16})`
      );
      values.push(
        lead.lead_id,
        lead.source,
        lead.url,
        lead.nama_proyek,
        lead.nama_perusahaan,
        lead.industri,
        lead.lokasi,
        lead.nilai_proyek || 0,
        lead.deadline,
        lead.kebutuhan,
        lead.deskripsi_kebutuhan,
        lead.pic_nama,
        lead.pic_jabatan,
        lead.pic_email,
        lead.pic_telepon,
        lead.status || "active"
      );
    });

    const result = await query(
      `INSERT INTO raw_leads (
        lead_id, source, url, nama_proyek, nama_perusahaan, industri, lokasi,
        nilai_proyek, deadline, kebutuhan, deskripsi_kebutuhan,
        pic_nama, pic_jabatan, pic_email, pic_telepon, status
      ) VALUES ${placeholders.join(", ")}
      ON CONFLICT (lead_id) DO NOTHING`,
      values
    );

    return result.rowCount || 0;
  },

  async getAllRawLeads(): Promise<RawLead[]> {
    const result = await query<RawLead>(
      "SELECT * FROM raw_leads WHERE status = 'active' ORDER BY created_at DESC"
    );
    return result.rows;
  },

  async getLeadStats(): Promise<any> {
    const result = await query(`
      SELECT
        COUNT(*) as total_leads,
        COUNT(DISTINCT source) as total_sources,
        COUNT(DISTINCT industri) as total_industries,
        SUM(nilai_proyek) as total_nilai,
        json_agg(DISTINCT source) as sources,
        json_object_agg(industri, industri_count) as by_industry
      FROM raw_leads,
        LATERAL (SELECT industri, COUNT(*) as industri_count FROM raw_leads GROUP BY industri) as ind
      WHERE status = 'active'
    `);
    return result.rows[0];
  },
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

process.on("SIGINT", async () => {
  console.log("[Database] Closing connection pool...");
  await pool.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[Database] Closing connection pool...");
  await pool.end();
  process.exit(0);
});
