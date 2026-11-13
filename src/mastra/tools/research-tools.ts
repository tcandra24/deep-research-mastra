import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getReportForUser, listRuns } from "../lib/research-store";

// Tool ini dipanggil oleh model, jadi TIDAK BOLEH mempercayai argumen model
// untuk menentukan pemilik. userId selalu diambil dari requestContext yang
// diisi server (dari JWT), dan semua query dibatasi ke pengguna itu.
function userIdFrom(context: unknown): string {
  const ctx = context as { requestContext?: { get(key: string): unknown } } | undefined;
  const userId = ctx?.requestContext?.get("userId");
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("Konteks pengguna tidak tersedia.");
  }
  return userId;
}

export const getResearch = createTool({
  id: "get-research",
  description: "Ambil laporan riset milik pengguna berdasarkan id laporan. Mengembalikan topik dan isi laporan lengkap (sudah berisi daftar sumber).",
  inputSchema: z.object({
    reportId: z.string().describe("Id laporan riset"),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    topic: z.string().optional(),
    report: z.string().optional(),
  }),
  execute: async (inputData, context) => {
    const userId = userIdFrom(context);
    const saved = await getReportForUser(inputData.reportId, userId);
    if (!saved) return { found: false };
    return { found: true, topic: saved.topic, report: saved.report };
  },
});

export const listResearch = createTool({
  id: "list-research",
  description: "Daftar riset milik pengguna yang sudah selesai (terbaru lebih dulu): id, topik, dan waktu dibuat. Gunakan jika pengguna merujuk riset lama tanpa menyebut id.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    reports: z.array(z.object({ id: z.string(), topic: z.string(), createdAt: z.string() })),
  }),
  execute: async (_inputData, context) => {
    const userId = userIdFrom(context);
    const runs = await listRuns(userId, 10);
    return {
      reports: runs.filter((r) => r.hasReport).map((r) => ({ id: r.runId, topic: r.topic, createdAt: r.createdAt })),
    };
  },
});
