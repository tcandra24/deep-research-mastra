import { PostgresStore } from "@mastra/pg";
import { Pool } from "pg";

// Satu koneksi pool dipakai bersama oleh Mastra (workflow, memory) dan
// tabel buatan kita (lib/research-store.ts), supaya jumlah koneksi ke
// database tetap terkendali.
//
// DATABASE_URL: connection string Postgres (Neon). Gunakan endpoint
// "pooled" (host berakhiran -pooler) untuk aplikasi.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL belum diisi (connection string Postgres, mis. dari dashboard Neon).");
}

export const pool = new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// Error pada koneksi yang sedang idle (mis. diputus server) tidak boleh
// mematikan proses; pool akan membuat koneksi baru saat dibutuhkan.
pool.on("error", (err) => {
  console.error("[db] error pada koneksi idle:", err.message);
});

// Tabel Mastra ditaruh di schema sendiri agar terpisah dari tabel aplikasi
// dan tabel Neon Auth.
export const storage = new PostgresStore({
  id: "mastra-storage",
  pool,
  schemaName: "mastra",
});
