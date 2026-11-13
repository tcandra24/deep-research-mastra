import { Mastra } from "@mastra/core";
import { researcherAgent } from "./agents/researcher-agent";
import { plannerAgent } from "./agents/planner-agent";
import { writerAgent } from "./agents/writer-agent";
import { reviewerAgent } from "./agents/reviewer-agent";
import { qaAgent } from "./agents/qa-agent";
import { securityMiddleware } from "./server/middleware";
import { apiRoutes } from "./server/routes";
import { storage } from "./storage";
import { deepResearchWorkflow } from "./workflows/deep-research";
import { chiefSportAgent } from "./agents/sportcenter/chief-agent";

// Origin frontend yang boleh memanggil API (dipisah koma).
const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export const mastra = new Mastra({
  agents: { researcherAgent, plannerAgent, writerAgent, reviewerAgent, qaAgent, chiefSportAgent },
  workflows: { deepResearchWorkflow },

  // Satu storage bersama untuk workflow dan memory (lihat storage.ts).
  storage,

  server: {
    port: Number(process.env.PORT) || 4111,
    host: process.env.HOST ?? "0.0.0.0",
    apiRoutes,
    middleware: [securityMiddleware],
    cors: {
      origin: corsOrigins,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    },
    // Beri waktu request yang sedang berjalan untuk selesai saat shutdown.
    drainTimeout: 30_000,
  },
});
