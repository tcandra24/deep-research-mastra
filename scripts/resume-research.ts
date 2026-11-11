import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { mastra } from "../src/mastra";
import { APPROVE_STEP_ID, printOutcome, promptDecision, readPlan, toResumeData } from "./decide";

async function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error("Pemakaian: npm run research:resume -- <runId>");
    process.exit(1);
  }

  const workflow = mastra.getWorkflow("deepResearchWorkflow");

  // Baca state run dari storage (tetap ada walau proses sudah berganti).
  const state = await workflow.getWorkflowRunById(runId);
  if (!state) {
    console.error(`Run ${runId} tidak ditemukan.`);
    process.exit(1);
  }
  if (state.status !== "suspended") {
    console.error(`Run ini berstatus "${state.status}", bukan "suspended".`);
    process.exit(1);
  }

  const plan = readPlan(state.steps);
  if (!plan) {
    console.error("Rencana tidak terbaca dari state run.");
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const decision = await promptDecision(rl, plan);
  rl.close();

  if (decision.kind === "defer") {
    console.log("Ditunda. Run tetap menunggu.");
    return;
  }

  const run = await workflow.createRun({ runId });
  const result = await run.resume({
    step: APPROVE_STEP_ID,
    resumeData: toResumeData(decision),
  });

  process.exit(printOutcome(result));
}

main();
