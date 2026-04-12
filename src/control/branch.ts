import type { StepDef, StepBuilder } from "../core/step.js";
import type { Context } from "../core/context.js";

export interface BranchDef {
  type: "branch";
  predicate: (ctx: Context) => boolean;
  trueBranch: StepDef;
  falseBranch: StepDef;
}

/**
 * Route execution based on a condition.
 *
 * Usage:
 *   branch(
 *     ctx => (ctx.state.classify as { confidence: number }).confidence > 0.8,
 *     { true: publishStep, false: reviewStep }
 *   )
 */
export function branch(
  predicate: (ctx: Context) => boolean,
  branches: {
    true: StepDef | StepBuilder;
    false: StepDef | StepBuilder;
  },
): BranchDef {
  const resolve = (s: StepDef | StepBuilder): StepDef =>
    "build" in s && typeof (s as StepBuilder).build === "function"
      ? (s as StepBuilder).build()
      : (s as StepDef);
  return {
    type: "branch",
    predicate,
    trueBranch: resolve(branches.true),
    falseBranch: resolve(branches.false),
  };
}
