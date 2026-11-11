import type { Interface } from "node:readline/promises";
import { z } from "zod";

export const APPROVE_STEP_ID = "approve-plan";

// Bentuk data yang dikirim step approve-plan saat workflow berhenti.
const planSchema = z.object({
  reason: z.string(),
  topic: z.string(),
  subQuestions: z.array(z.string()),
});
export type Plan = z.infer<typeof planSchema>;

export type Decision = { kind: "approve" } | { kind: "edit"; subQuestions: string[] } | { kind: "reject" } | { kind: "defer" };

// Ambil rencana dari hasil workflow/state run yang berstatus "suspended".
export function readPlan(steps: unknown): Plan | null {
  const payload = (steps as Record<string, { suspendPayload?: unknown }> | undefined)?.[APPROVE_STEP_ID]?.suspendPayload;
  const parsed = planSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export async function promptDecision(rl: Interface, plan: Plan): Promise<Decision> {
  console.log(`\nTopik: ${plan.topic}\nRencana sub-pertanyaan:`);
  plan.subQuestions.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

  // Antrean baris: tidak ada baris yang hilang walau beberapa baris masuk
  // sekaligus (misalnya di-paste). Mengembalikan null jika input habis.
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt: string): Promise<string | null> => {
    process.stdout.write(prompt);
    const next = await lines.next();
    return next.done ? null : String(next.value).trim();
  };

  while (true) {
    const raw = await ask("\n[Enter] setuju  [e] ubah  [n] tolak  [q] tunda: ");
    if (raw === null) return { kind: "defer" };

    const answer = raw.toLowerCase();
    if (answer === "" || answer === "y") return { kind: "approve" };
    if (answer === "n") return { kind: "reject" };
    if (answer === "q") return { kind: "defer" };

    if (answer === "e") {
      console.log("Tulis sub-pertanyaan baru, satu per baris. Baris kosong untuk selesai.");
      const edited: string[] = [];
      while (true) {
        const line = await ask(`${edited.length + 1}> `);
        if (line === null) return { kind: "defer" };
        if (!line) break;
        edited.push(line);
      }
      if (edited.length === 0) {
        console.log("Tidak ada input, kembali ke menu.");
        continue;
      }
      return { kind: "edit", subQuestions: edited };
    }
  }
}

export function toResumeData(decision: Exclude<Decision, { kind: "defer" }>) {
  switch (decision.kind) {
    case "approve":
      return { approved: true };
    case "edit":
      return { approved: true, subQuestions: decision.subQuestions };
    case "reject":
      return { approved: false };
  }
}

// Cetak hasil akhir workflow sesuai statusnya.
export function printOutcome(result: { status: string; result?: unknown; error?: unknown }): number {
  if (result.status === "success") {
    const { report, reportId } = result.result as { report: string; reportId?: string };
    console.log(report);
    if (reportId) {
      console.log(`\nId laporan: ${reportId}`);
      console.log(`Tanya lanjutan: npm run ask -- ${reportId}`);
    }
    return 0;
  }
  if (result.status === "failed") {
    const message = (result.error as { message?: string } | undefined)?.message;
    console.error(`\nWorkflow berhenti: ${message ?? "error tidak diketahui"}`);
    return 1;
  }
  console.error(`\nWorkflow berstatus: ${result.status}`);
  return 1;
}
