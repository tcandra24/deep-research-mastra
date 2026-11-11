import { LibSQLStore } from "@mastra/libsql";

// Satu instance storage dipakai bersama oleh Mastra (workflow/snapshot)
// dan Memory (thread, pesan, working memory).
// Lokal: file SQLite. Saat deploy, ganti dengan database eksternal.
export const DB_URL = process.env.DATABASE_URL ?? "file:./mastra.db";

export const storage = new LibSQLStore({
  id: "mastra-storage",
  url: DB_URL,
});
