import type { Context } from "../core/context.js";
import type { StepDef } from "../core/step.js";
import { resolveStep } from "./resolve.js";

export interface BranchDef {
  type: "branch";
  predicate: (ctx: Context) => boolean;
  trueBranch: StepDef;
  falseBranch: StepDef;
}

/**
 * Route execution based on a condition.
 */
export function branch(
  predicate: (ctx: Context) => boolean,
  branches: { true: StepDef | { build(): StepDef }; false: StepDef | { build(): StepDef } },
): BranchDef {
  return {
    type: "branch",
    predicate,
    trueBranch: resolveStep(branches.true),
    falseBranch: resolveStep(branches.false),
  };
}
