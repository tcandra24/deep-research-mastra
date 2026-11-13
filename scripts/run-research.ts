import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { mastra } from "../src/mastra";
import { RESOURCE_ID } from "../src/mastra/config";
import { saveRun } from "../src/mastra/lib/research-store";
import { APPROVE_STEP_ID, printOutcome, promptDecision, readPlan, toResumeData } from "./decide";

async function main() {
  const topic = process.argv.slice(2).join(" ").trim();
  if (!topic) {
    console.error('Pemakaian: npm run research -- "topik riset"');
    process.exit(1);
  }

  const workflow = mastra.getWorkflow("deepResearchWorkflow");
  const run = await workflow.createRun();

  // Catat pemilik run agar laporannya bisa dibaca lewat `npm run ask`
  // (kepemilikan laporan ditentukan lewat tabel research_runs).
  await saveRun({ runId: run.runId, userId: RESOURCE_ID, topic });

  let result = await run.start({ inputData: { topic, userId: RESOURCE_ID } });

  if (result.status === "suspended") {
    const plan = readPlan(result.steps);
    if (!plan) {
      console.error("Workflow berhenti, tapi rencana tidak terbaca.");
      process.exit(1);
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const decision = await promptDecision(rl, plan);
    rl.close();

    if (decision.kind === "defer") {
      console.log(`\nDitunda. Lanjutkan nanti dengan:\n  npm run research:resume -- ${run.runId}`);
      return;
    }

    result = await run.resume({
      step: APPROVE_STEP_ID,
      resumeData: toResumeData(decision),
    });
  }

  process.exit(printOutcome(result));
}

main();
