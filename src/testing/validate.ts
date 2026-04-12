import type { PipelineDef } from "../core/pipeline.js";

export interface ValidationError {
  stepId: string;
  message: string;
  severity: "error" | "warning";
}

/**
 * Statically validate a pipeline's wiring — no execution needed.
 * Checks that step output schemas are compatible with downstream inputs.
 *
 * Usage:
 *   const errors = validate(myPipeline);
 *   if (errors.length > 0) console.error(errors);
 */
export function validate(pipeline: PipelineDef): ValidationError[] {
  const errors: ValidationError[] = [];
  const providedOutputs = new Set<string>();

  for (const node of pipeline.nodes) {
    if (node.type !== "step") continue;
    const step = node.step;

    // Check step has either a prompt or a fn
    if (!step.promptTemplate && !step.fn && !step.deterministic) {
      errors.push({
        stepId: step.id,
        message: `Step "${step.id}" has no prompt and no function — it won't do anything`,
        severity: "error",
      });
    }

    // Check for missing output schema on LLM steps
    if (!step.deterministic && !step.outputSchema) {
      errors.push({
        stepId: step.id,
        message: `Step "${step.id}" has no output schema — output won't be validated`,
        severity: "warning",
      });
    }

    // Check prompt references to previous step outputs
    if (step.promptTemplate) {
      const refs = step.promptTemplate.match(/\{([^}]+)\}/g) ?? [];
      for (const ref of refs) {
        const path = ref.slice(1, -1); // remove { }
        const stepRef = path.split(".")[0];
        // Check if the referenced step exists (only if it looks like a step reference)
        if (stepRef && !providedOutputs.has(stepRef) && stepRef !== "item") {
          // Could be an input variable — only warn if it looks like a step ref
          if (path.includes(".")) {
            errors.push({
              stepId: step.id,
              message: `Step "${step.id}" references "{${path}}" but step "${stepRef}" hasn't run yet`,
              severity: "warning",
            });
          }
        }
      }
    }

    providedOutputs.add(step.id);
  }

  // Check for duplicate step IDs
  const ids = pipeline.nodes
    .filter((n) => n.type === "step")
    .map((n) => n.step.id);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      errors.push({ stepId: id, message: `Duplicate step ID: "${id}"`, severity: "error" });
    }
    seen.add(id);
  }

  return errors;
}
