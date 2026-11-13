import type { Mastra } from "@mastra/core";
import { getReport, type RunRecord } from "../lib/research-store";
import type { RunDTO, RunStatus, RunStep, StepStatus } from "./types";

// Urutan step untuk tampilan progres. "fill-gaps" hanya muncul
// jika cabang putaran kedua benar-benar dijalankan.
const STEP_LABELS: { id: string; label: string; optional?: boolean }[] = [
  { id: "plan", label: "Menyusun rencana" },
  { id: "approve-plan", label: "Persetujuan rencana" },
  { id: "research-one", label: "Meriset sub-pertanyaan" },
  { id: "review", label: "Memeriksa kelengkapan" },
  { id: "fill-gaps", label: "Menutup celah", optional: true },
  { id: "filter-sources", label: "Menyaring sumber" },
  { id: "write", label: "Menulis laporan" },
  { id: "save-report", label: "Menyimpan laporan" },
];

function toStepStatus(raw: unknown): StepStatus {
  switch (raw) {
    case "success":
      return "success";
    case "suspended":
    case "waiting":
      return "suspended";
    case "failed":
    case "canceled":
    case "tripwire":
      return "failed";
    case "running":
      return "running";
    default:
      return "pending";
  }
}

function toRunStatus(raw: unknown): RunStatus {
  switch (raw) {
    case "success":
      return "success";
    case "suspended":
      return "suspended";
    case "failed":
    case "canceled":
    case "tripwire":
      return "failed";
    default:
      return "running";
  }
}

type StepState = { status?: unknown; suspendPayload?: unknown; error?: unknown };

// Kepemilikan run HARUS sudah diverifikasi oleh pemanggil.
export async function buildRunDTO(mastra: Mastra, run: RunRecord): Promise<RunDTO> {
  const workflow = mastra.getWorkflow("deepResearchWorkflow");
  const state = await workflow.getWorkflowRunById(run.runId);

  // Run baru dibuat; snapshot pertama belum tersimpan.
  if (!state) {
    return { runId: run.runId, topic: run.topic, status: "starting", steps: [] };
  }

  const stepStates = (state.steps ?? {}) as Record<string, StepState>;
  const status = toRunStatus(state.status);

  const steps: RunStep[] = STEP_LABELS.filter((s) => !s.optional || stepStates[s.id] !== undefined).map((s) => ({
    id: s.id,
    label: s.label,
    status: toStepStatus(stepStates[s.id]?.status),
  }));

  // Selama berjalan, step pertama yang belum selesai dianggap sedang dikerjakan.
  if (status === "running" && !steps.some((s) => s.status === "running")) {
    const next = steps.find((s) => s.status === "pending");
    if (next) next.status = "running";
  }

  const dto: RunDTO = { runId: run.runId, topic: run.topic, status, steps };

  if (status === "suspended") {
    const payload = stepStates["approve-plan"]?.suspendPayload as { reason?: string; topic?: string; subQuestions?: string[] } | undefined;
    if (payload?.subQuestions) {
      dto.plan = {
        reason: payload.reason ?? "",
        topic: payload.topic ?? run.topic,
        subQuestions: payload.subQuestions,
      };
    }
  }

  if (status === "success") {
    const saved = await getReport(run.runId);
    if (saved) {
      dto.report = saved.report;
      dto.reportId = saved.id;
    }
  }

  if (status === "failed") {
    const message = (state.error as { message?: string } | undefined)?.message;
    dto.error = message ?? "Riset berhenti karena error.";
  }

  return dto;
}
