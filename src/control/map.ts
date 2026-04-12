import type { StepDef } from "../core/step.js";
import { resolveStep } from "./resolve.js";

export interface MapConfig {
  concurrency?: number;
}

export interface MapDef {
  type: "map";
  arrayKey: string;
  step: StepDef;
  config: MapConfig;
}

/**
 * Run a step over each item in an array from context.
 */
export function map(
  arrayKey: string,
  s: StepDef | { build(): StepDef },
  config?: MapConfig,
): MapDef {
  return { type: "map", arrayKey, step: resolveStep(s), config: config ?? {} };
}
