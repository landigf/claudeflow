import type { StepDef } from "../core/step.js";

/**
 * Resolve a StepDef from either a StepDef or a StepBuilder.
 * Shared utility to avoid duplicating this pattern in every control flow module.
 */
export function resolveStep(s: StepDef | { build(): StepDef }): StepDef {
  if ("build" in s && typeof s.build === "function") {
    return s.build();
  }
  return s as StepDef;
}
