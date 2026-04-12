import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { StepTrace } from "../observability/trace.js";

/**
 * Checkpoint system for resumable pipelines.
 * Saves pipeline state after each step — if a pipeline crashes at step 7,
 * resume from step 7 instead of restarting from scratch.
 *
 * Usage:
 *   const cp = new CheckpointManager(".claudeflow/checkpoints");
 *   await pipeline.run(input, { runtime, checkpoint: cp });
 *   // If it crashes, next run auto-resumes from last checkpoint
 */
export class CheckpointManager {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = path.resolve(dir);
    if (!existsSync(this.#dir)) {
      mkdirSync(this.#dir, { recursive: true });
    }
  }

  /** Save checkpoint after a step completes. */
  save(runId: string, checkpoint: Checkpoint): void {
    const filePath = this.#checkpointPath(runId);
    writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
  }

  /** Load checkpoint for a pipeline run. Returns undefined if no checkpoint. */
  load(pipelineName: string): Checkpoint | undefined {
    // Find the most recent checkpoint for this pipeline
    const files = this.#listFiles();
    for (const file of files.reverse()) {
      try {
        const raw = readFileSync(path.join(this.#dir, file), "utf-8");
        const cp = JSON.parse(raw) as Checkpoint;
        if (cp.pipelineName === pipelineName && (cp.status === "in_progress" || cp.status === "failed")) {
          return cp;
        }
      } catch {
        continue;
      }
    }
    return undefined;
  }

  /** Mark a checkpoint as completed (pipeline finished). */
  complete(runId: string): void {
    const filePath = this.#checkpointPath(runId);
    if (!existsSync(filePath)) return;
    const raw = readFileSync(filePath, "utf-8");
    const cp = JSON.parse(raw) as Checkpoint;
    cp.status = "completed";
    cp.completedAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(cp, null, 2));
  }

  /** Mark a checkpoint as failed. */
  fail(runId: string, error: string): void {
    const filePath = this.#checkpointPath(runId);
    if (!existsSync(filePath)) return;
    const raw = readFileSync(filePath, "utf-8");
    const cp = JSON.parse(raw) as Checkpoint;
    cp.status = "failed";
    cp.error = error;
    writeFileSync(filePath, JSON.stringify(cp, null, 2));
  }

  #checkpointPath(runId: string): string {
    return path.join(this.#dir, `${runId}.json`);
  }

  #listFiles(): string[] {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    if (!existsSync(this.#dir)) return [];
    return readdirSync(this.#dir)
      .filter((f: string) => f.endsWith(".json"))
      .sort();
  }
}

export interface Checkpoint {
  runId: string;
  pipelineName: string;
  status: "in_progress" | "completed" | "failed";
  /** Which step index to resume from (0-based) */
  completedStepIndex: number;
  /** Serialized context state at the checkpoint */
  contextState: Record<string, unknown>;
  /** Input that was passed to the pipeline */
  input: unknown;
  /** Traces of completed steps */
  completedTraces: StepTrace[];
  /** When the checkpoint was created */
  createdAt: string;
  /** When completed (if finished) */
  completedAt?: string;
  /** Error message (if failed) */
  error?: string;
}
