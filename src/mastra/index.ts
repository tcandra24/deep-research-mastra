import { Mastra } from "@mastra/core/mastra";
import { researcherAgent } from "./agents/researcher-agent";
import { plannerAgent } from "./agents/planner-agent";
import { writerAgent } from "./agents/writter-agent";
import { reviewerAgent } from "./agents/reviewer-agent";
import { qaAgent } from "./agents/qa-agent";

import { deepResearchWorkflow } from "./workflows/deep-research";

import { storage } from "./storage";

export const mastra = new Mastra({
  agents: { researcherAgent, plannerAgent, writerAgent, reviewerAgent, qaAgent },
  workflows: { deepResearchWorkflow },
  storage,
});
