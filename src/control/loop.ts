import type { StepDef, StepBuilder } from "../core/step.js";
import type { Context } from "../core/context.js";

export interface LoopConfig {
  /** Maximum iterations before giving up */
  maxIterations: number;
  /** Optional label for verbose output */
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
 *
 * Usage:
 *   loop(
 *     step("refine").prompt("Improve this: {refine.result}"),
 *     ctx => (ctx.state.refine as { score: number }).score > 0.9,
 *     { maxIterations: 5 }
 *   )
 */
export function loop(
  s: StepDef | StepBuilder,
  condition: (ctx: Context) => boolean,
  config: LoopConfig,
): LoopDef {
  const def = "build" in s && typeof (s as StepBuilder).build === "function"
    ? (s as StepBuilder).build()
    : (s as StepDef);
  return { type: "loop", step: def, condition, config };
}
