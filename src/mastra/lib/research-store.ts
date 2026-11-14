import { pool } from "../storage";

// Penyimpanan laporan riset dan daftar run milik pengguna (schema public).
// Tabel dibuat otomatis saat pertama dipakai.

let ready: Promise<void> | null = null;

function ensureTables(): Promise<void> {
  // Jika gagal, izinkan percobaan ulang pada pemanggilan berikutnya.
  ready ??= initTables().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

async function initTables() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Kunci tingkat transaksi: beberapa instance server yang start bersamaan
    // tidak akan saling bertabrakan saat membuat tabel.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('research_tables'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.research_reports (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        report TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.research_runs (
        run_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await client.query(`
      CREATE INDEX IF NOT EXISTS research_runs_user_created_idx
      ON public.research_runs (user_id, created_at DESC)`);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------- Laporan ----------

export type SavedReport = {
  id: string;
  topic: string;
  report: string;
  createdAt: string;
};

type ReportRow = { id: string; topic: string; report: string; created_at: Date };

const toReport = (row: ReportRow): SavedReport => ({
  id: row.id,
  topic: row.topic,
  report: row.report,
  createdAt: row.created_at.toISOString(),
});

export async function saveReport(input: { id: string; topic: string; report: string }) {
  await ensureTables();
  await pool.query(
    `INSERT INTO public.research_reports (id, topic, report)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET topic = EXCLUDED.topic, report = EXCLUDED.report`,
    [input.id, input.topic, input.report],
  );
}

// Tanpa cek pemilik: pakai hanya setelah kepemilikan run diverifikasi.
export async function getReport(id: string): Promise<SavedReport | null> {
  await ensureTables();
  const res = await pool.query<ReportRow>("SELECT id, topic, report, created_at FROM public.research_reports WHERE id = $1", [id]);
  return res.rows[0] ? toReport(res.rows[0]) : null;
}

// Ambil laporan HANYA jika dimiliki userId (id laporan = id run).
export async function getReportForUser(id: string, userId: string): Promise<SavedReport | null> {
  await ensureTables();
  const res = await pool.query<ReportRow>(
    `SELECT rep.id, rep.topic, rep.report, rep.created_at
     FROM public.research_reports rep
     JOIN public.research_runs r ON r.run_id = rep.id
     WHERE rep.id = $1 AND r.user_id = $2`,
    [id, userId],
  );
  return res.rows[0] ? toReport(res.rows[0]) : null;
}

// ---------- Run milik pengguna ----------
// Id laporan = id run, jadi kepemilikan laporan ditentukan lewat tabel ini.

export type RunRecord = {
  runId: string;
  userId: string;
  topic: string;
  createdAt: string;
};

type RunRow = { run_id: string; user_id: string; topic: string; created_at: Date };

// Pemilik tidak pernah diganti: jika runId sudah ada, tidak terjadi apa-apa.
export async function saveRun(input: { runId: string; userId: string; topic: string }) {
  await ensureTables();
  await pool.query(
    `INSERT INTO public.research_runs (run_id, user_id, topic)
     VALUES ($1, $2, $3)
     ON CONFLICT (run_id) DO NOTHING`,
    [input.runId, input.userId, input.topic],
  );
}

export async function getRun(runId: string): Promise<RunRecord | null> {
  await ensureTables();
  const res = await pool.query<RunRow>("SELECT run_id, user_id, topic, created_at FROM public.research_runs WHERE run_id = $1", [runId]);
  const row = res.rows[0];
  if (!row) return null;
  return {
    runId: row.run_id,
    userId: row.user_id,
    topic: row.topic,
    createdAt: row.created_at.toISOString(),
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
  const res = await pool.query<{
    run_id: string;
    topic: string;
    created_at: Date;
    has_report: boolean;
  }>(
    `SELECT r.run_id, r.topic, r.created_at, (rep.id IS NOT NULL) AS has_report
     FROM public.research_runs r
     LEFT JOIN public.research_reports rep ON rep.id = r.run_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return res.rows.map((row) => ({
    runId: row.run_id,
    topic: row.topic,
    createdAt: row.created_at.toISOString(),
    hasReport: row.has_report,
  }));
}

// Jumlah riset yang dimulai pengguna sejak waktu tertentu (batas biaya).
export async function countRunsSince(userId: string, sinceIso: string): Promise<number> {
  await ensureTables();
  const res = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM public.research_runs
     WHERE user_id = $1 AND created_at >= $2`,
    [userId, new Date(sinceIso)],
  );
  return res.rows[0]?.n ?? 0;
}
