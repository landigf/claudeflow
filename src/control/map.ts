import type { StepDef, StepBuilder } from "../core/step.js";

export interface MapConfig {
  /** Max concurrent executions (only with API runtime). Default: 1 */
  concurrency?: number;
}

export interface MapDef {
  type: "map";
  /** Key in context.state that contains the array to iterate over */
  arrayKey: string;
  step: StepDef;
  config: MapConfig;
}

/**
 * Run a step over each item in an array from context.
 *
 * Usage:
 *   map("scrape.listings", contactStep, { concurrency: 3 })
 */
export function map(
  arrayKey: string,
  s: StepDef | StepBuilder,
  config?: MapConfig,
): MapDef {
  const def = "build" in s && typeof (s as StepBuilder).build === "function"
    ? (s as StepBuilder).build()
    : (s as StepDef);
  return {
    type: "map",
    arrayKey,
    step: def,
    config: config ?? {},
  };
}
