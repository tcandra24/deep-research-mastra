// Bentuk data yang dikirim API ke frontend.

export type StepStatus = "pending" | "running" | "suspended" | "success" | "failed";

export type RunStatus = "starting" | "running" | "suspended" | "success" | "failed";

export type RunStep = {
  id: string;
  label: string;
  status: StepStatus;
};

export type RunPlan = {
  reason: string;
  topic: string;
  subQuestions: string[];
};

export type RunDTO = {
  runId: string;
  topic: string;
  status: RunStatus;
  steps: RunStep[];
  plan?: RunPlan;
  report?: string;
  reportId?: string;
  error?: string;
};
