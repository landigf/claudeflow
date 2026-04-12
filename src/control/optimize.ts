import type { StepDef } from "../core/step.js";
import { resolveStep } from "./resolve.js";

export interface OptimizeConfig {
  /** Key in eval output containing the metric number */
  metricKey: string;
  /** Which direction is better */
  direction: "lower" | "higher";
  /** Max iterations */
  maxIterations: number;
  /** Optional time budget per iteration in ms */
  timeBudgetMs?: number;
  /** Optional label for verbose output */
  label?: string;
}

export interface OptimizeDef {
  type: "optimize";
  /** Step that modifies the target (LLM edits code) */
  mutateStep: StepDef;
  /** Step that evaluates the result (usually a tool/shell step) */
  evalStep: StepDef;
  config: OptimizeConfig;
}

/**
 * Optimization loop — the generalized autoresearch pattern.
 *
 * Mutate → evaluate → keep or discard → repeat.
 *
 * Usage:
 *   optimize(
 *     step("improve").prompt("Improve test coverage...").tools(["file", "shell"]),
 *     step("measure").fn(async () => { ... return { coverage: 85 } }),
 *     { metricKey: "coverage", direction: "higher", maxIterations: 10 }
 *   )
 */
export function optimize(
  mutateStep: StepDef | { build(): StepDef },
  evalStep: StepDef | { build(): StepDef },
  config: OptimizeConfig,
): OptimizeDef {
  return {
    type: "optimize",
    mutateStep: resolveStep(mutateStep),
    evalStep: resolveStep(evalStep),
    config,
  };
}
