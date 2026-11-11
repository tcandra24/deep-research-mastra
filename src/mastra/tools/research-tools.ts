import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getReport, listReports } from "../lib/research-store";

export const getResearch = createTool({
  id: "get-research",
  description: "Ambil laporan riset tersimpan berdasarkan id laporan. Mengembalikan topik dan isi laporan lengkap (sudah berisi daftar sumber).",
  inputSchema: z.object({
    reportId: z.string().describe("Id laporan riset"),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    topic: z.string().optional(),
    report: z.string().optional(),
  }),
  execute: async (inputData) => {
    const saved = await getReport(inputData.reportId);
    if (!saved) return { found: false };
    return { found: true, topic: saved.topic, report: saved.report };
  },
});

export const listResearch = createTool({
  id: "list-research",
  description: "Daftar riset yang pernah disimpan (terbaru lebih dulu): id, topik, dan waktu dibuat. Gunakan jika pengguna merujuk riset lama tanpa menyebut id.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    reports: z.array(z.object({ id: z.string(), topic: z.string(), createdAt: z.string() })),
  }),
  execute: async () => ({ reports: await listReports(10) }),
});
