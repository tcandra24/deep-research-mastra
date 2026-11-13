import { createClient } from "@libsql/client";
import { DB_URL } from "../storage";

// Penyimpanan laporan riset dan daftar run milik pengguna
// (tabel sederhana di database yang sama dengan Mastra).
const db = createClient({ url: DB_URL });

let ready: Promise<unknown> | null = null;
function ensureTables() {
  ready ??= db.batch([
    `CREATE TABLE IF NOT EXISTS research_reports (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      report TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS research_runs (
      run_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  ]);
  return ready;
}

// ---------- Laporan ----------

export type SavedReport = {
  id: string;
  topic: string;
  report: string;
  createdAt: string;
};

export async function saveReport(input: { id: string; topic: string; report: string }) {
  await ensureTables();
  await db.execute({
    sql: `INSERT OR REPLACE INTO research_reports (id, topic, report, created_at)
          VALUES (?, ?, ?, ?)`,
    args: [input.id, input.topic, input.report, new Date().toISOString()],
  });
}

// Tanpa cek pemilik: pakai hanya setelah kepemilikan run diverifikasi.
export async function getReport(id: string): Promise<SavedReport | null> {
  await ensureTables();
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

// Ambil laporan HANYA jika dimiliki userId (id laporan = id run).
export async function getReportForUser(id: string, userId: string): Promise<SavedReport | null> {
  await ensureTables();
  const res = await db.execute({
    sql: `SELECT rep.id, rep.topic, rep.report, rep.created_at
          FROM research_reports rep
          JOIN research_runs r ON r.run_id = rep.id
          WHERE rep.id = ? AND r.user_id = ?`,
    args: [id, userId],
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

// ---------- Run milik pengguna ----------
// Id laporan = id run, jadi kepemilikan laporan ditentukan lewat tabel ini.

export type RunRecord = {
  runId: string;
  userId: string;
  topic: string;
  createdAt: string;
};

export async function saveRun(input: { runId: string; userId: string; topic: string }) {
  await ensureTables();
  await db.execute({
    sql: `INSERT OR REPLACE INTO research_runs (run_id, user_id, topic, created_at)
          VALUES (?, ?, ?, ?)`,
    args: [input.runId, input.userId, input.topic, new Date().toISOString()],
  });
}

export async function getRun(runId: string): Promise<RunRecord | null> {
  await ensureTables();
  const res = await db.execute({
    sql: "SELECT run_id, user_id, topic, created_at FROM research_runs WHERE run_id = ?",
    args: [runId],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    runId: String(row.run_id),
    userId: String(row.user_id),
    topic: String(row.topic),
    createdAt: String(row.created_at),
  };
}

export type RunSummary = {
  runId: string;
  topic: string;
  createdAt: string;
  hasReport: boolean;
};

export async function listRuns(userId: string, limit = 20): Promise<RunSummary[]> {
  await ensureTables();
  const res = await db.execute({
    sql: `SELECT r.run_id, r.topic, r.created_at, (rep.id IS NOT NULL) AS has_report
          FROM research_runs r
          LEFT JOIN research_reports rep ON rep.id = r.run_id
          WHERE r.user_id = ?
          ORDER BY r.created_at DESC
          LIMIT ?`,
    args: [userId, limit],
  });
  return res.rows.map((row) => ({
    runId: String(row.run_id),
    topic: String(row.topic),
    createdAt: String(row.created_at),
    hasReport: Number(row.has_report) === 1,
  }));
}

// Jumlah riset yang dimulai pengguna sejak waktu tertentu (batas biaya).
export async function countRunsSince(userId: string, sinceIso: string): Promise<number> {
  await ensureTables();
  const res = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM research_runs WHERE user_id = ? AND created_at >= ?",
    args: [userId, sinceIso],
  });
  return Number(res.rows[0]?.n ?? 0);
}
