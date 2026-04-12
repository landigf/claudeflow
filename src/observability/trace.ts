import type { TokenUsage } from "../runtime/types.js";

export interface PipelineTrace {
  runId: string;
  pipelineName: string;
  status: "completed" | "failed" | "partial";
  startedAt: Date;
  finishedAt: Date;
  totalDurationMs: number;
  totalTokens: TokenUsage;
  totalCostUsd: number;
  steps: StepTrace[];
}

export interface StepTrace {
  stepId: string;
  stepName: string;
  status: "completed" | "failed" | "skipped" | "retrying";
  durationMs: number;
  attempts: AttemptTrace[];
  inputSnapshot: unknown;
  outputSnapshot: unknown;
}

export interface AttemptTrace {
  attemptNumber: number;
  prompt: string;
  response: string;
  usage: TokenUsage;
  costUsd: number | null;
  durationMs: number;
  error?: string;
}
