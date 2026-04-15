import type { Context } from "../core/context.js";
import type { StepDef } from "../core/step.js";
import { resolveStep } from "./resolve.js";

export interface LoopConfig {
  maxIterations: number;
  label?: string;
}

export interface LoopDef {
  type: "loop";
  step: StepDef;
  condition: (ctx: Context) => boolean;
  config: LoopConfig;
}

/**
 * Repeat a step until a condition is met or maxIterations reached.
 */
export function loop(
  s: StepDef | { build(): StepDef },
  condition: (ctx: Context) => boolean,
  config: LoopConfig,
): LoopDef {
  return { type: "loop", step: resolveStep(s), condition, config };
}
