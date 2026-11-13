import type { Mastra } from "@mastra/core";
import { registerApiRoute } from "@mastra/core/server";
import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import { countRunsSince, getReport, getRun, listRuns, saveRun } from "../lib/research-store";
import { runInBackground } from "./background";
import { buildRunDTO } from "./run-status";

const MAX_RUNS_PER_HOUR = Number(process.env.MAX_RUNS_PER_HOUR ?? 10);

const startBody = z.object({
  topic: z.string().trim().min(3).max(300),
});

const resumeBody = z.object({
  approved: z.boolean(),
  subQuestions: z.array(z.string().trim().min(1).max(300)).max(10).optional(),
});

const askBody = z.object({
  question: z.string().trim().min(1).max(1000),
});

// userId diisi oleh securityMiddleware (dari JWT) ke requestContext.
function userOf(c: any): string {
  const userId = c.get("requestContext")?.get("userId");
  if (typeof userId !== "string" || !userId) throw new Error("userId tidak tersedia");
  return userId;
}

const mastraOf = (c: any) => c.get("mastra") as Mastra;

// 404 (bukan 403) agar keberadaan id milik orang lain tidak terungkap.
const notFound = (c: any, message: string) => c.json({ error: message }, 404);

export const apiRoutes = [
  // Daftar riset milik pengguna.
  registerApiRoute("/research", {
    method: "GET",
    handler: async (c) => c.json({ runs: await listRuns(userOf(c), 20) }),
  }),

  // Mulai riset baru. Mengembalikan runId; progres dipantau lewat GET.
  registerApiRoute("/research", {
    method: "POST",
    handler: async (c) => {
      const userId = userOf(c);

      const parsed = startBody.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return c.json({ error: "Topik harus 3-300 karakter." }, 400);
      }

      // Batas biaya: setiap riset memanggil LLM dan pencarian berbayar.
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      if ((await countRunsSince(userId, since)) >= MAX_RUNS_PER_HOUR) {
        return c.json({ error: "Terlalu banyak riset dalam satu jam. Coba lagi nanti." }, 429);
      }

      const { topic } = parsed.data;
      const run = await mastraOf(c).getWorkflow("deepResearchWorkflow").createRun();
      await saveRun({ runId: run.runId, userId, topic });
      runInBackground(() => run.start({ inputData: { topic, userId } }));

      return c.json({ runId: run.runId }, 202);
    },
  }),

  // Status dan progres satu riset (dipanggil berkala oleh UI).
  registerApiRoute("/research/:runId", {
    method: "GET",
    handler: async (c) => {
      const run = await getRun(c.req.param("runId"));
      if (!run || run.userId !== userOf(c)) return notFound(c, "Riset tidak ditemukan.");

      const dto = await buildRunDTO(mastraOf(c), run);
      c.header("Cache-Control", "no-store");
      return c.json(dto);
    },
  }),

  // Setujui / ubah / tolak rencana riset.
  registerApiRoute("/research/:runId/resume", {
    method: "POST",
    handler: async (c) => {
      const runId = c.req.param("runId");
      const record = await getRun(runId);
      if (!record || record.userId !== userOf(c)) return notFound(c, "Riset tidak ditemukan.");

      const parsed = resumeBody.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "Data keputusan tidak valid." }, 400);

      const workflow = mastraOf(c).getWorkflow("deepResearchWorkflow");
      const state = await workflow.getWorkflowRunById(runId);
      if (!state || state.status !== "suspended") {
        return c.json({ error: "Riset tidak sedang menunggu persetujuan." }, 409);
      }

      const run = await workflow.createRun({ runId });
      runInBackground(() => run.resume({ step: "approve-plan", resumeData: parsed.data }));

      return c.json({ ok: true }, 202);
    },
  }),

  // Tanya jawab lanjutan untuk satu laporan.
  registerApiRoute("/reports/:reportId/ask", {
    method: "POST",
    handler: async (c) => {
      const userId = userOf(c);
      const reportId = c.req.param("reportId");

      const run = await getRun(reportId);
      if (!run || run.userId !== userId || !(await getReport(reportId))) {
        return notFound(c, "Laporan tidak ditemukan.");
      }

      const parsed = askBody.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "Pertanyaan harus 1-1000 karakter." }, 400);

      // userId dikirim ke tool lewat requestContext (bukan lewat model).
      const requestContext = new RequestContext();
      requestContext.set("userId", userId);

      const result = await mastraOf(c)
        .getAgent("qaAgent")
        .generate(`Laporan: ${reportId}\nPertanyaan: ${parsed.data.question}`, { memory: { resource: userId, thread: reportId }, requestContext });

      return c.json({ answer: result.text });
    },
  }),
];
