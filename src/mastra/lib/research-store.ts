import { createClient } from "@libsql/client";
import { DB_URL } from "../storage";

// Penyimpanan laporan riset (tabel sederhana di database yang sama).
const db = createClient({ url: DB_URL });

let ready: Promise<unknown> | null = null;
function ensureTable() {
  ready ??= db.execute(`
    CREATE TABLE IF NOT EXISTS research_reports (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      report TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  return ready;
}

export type SavedReport = {
  id: string;
  topic: string;
  report: string;
  createdAt: string;
};

export async function saveReport(input: { id: string; topic: string; report: string }) {
  await ensureTable();
  await db.execute({
    sql: `INSERT OR REPLACE INTO research_reports (id, topic, report, created_at)
          VALUES (?, ?, ?, ?)`,
    args: [input.id, input.topic, input.report, new Date().toISOString()],
  });
}

export async function getReport(id: string): Promise<SavedReport | null> {
  await ensureTable();
  const res = await db.execute({
    sql: "SELECT id, topic, report, created_at FROM research_reports WHERE id = ?",
    args: [id],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    topic: String(row.topic),
    report: String(row.report),
    createdAt: String(row.created_at),
  };
}

export async function listReports(limit = 10): Promise<Omit<SavedReport, "report">[]> {
  await ensureTable();
  const res = await db.execute({
    sql: "SELECT id, topic, created_at FROM research_reports ORDER BY created_at DESC LIMIT ?",
    args: [limit],
  });
  return res.rows.map((row) => ({
    id: String(row.id),
    topic: String(row.topic),
    createdAt: String(row.created_at),
  }));
}
