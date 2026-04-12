import type { PipelineDef } from "../core/pipeline.js";
import type { StepDef } from "../core/step.js";

// ── Model Pricing (USD per 1M tokens, as of 2026) ──────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 0.8, output: 4.0 },
  default: { input: 3.0, output: 15.0 }, // assume Sonnet
};

// ── Analysis Types ──────────────────────────────────────────────────────────

export interface PipelineAnalysis {
  pipelineName: string;
  stepCount: number;
  llmStepCount: number;
  deterministicStepCount: number;
  controlFlowNodes: number;

  estimatedTokens: {
    input: { min: number; expected: number; max: number };
    output: { min: number; expected: number; max: number };
  };

  estimatedCost: Record<string, { perRun: number; withRetries: number }>;

  estimatedDuration: {
    sequentialMs: number;
    withRetriesMs: number;
  };

  requiredTools: string[];
  schemaWarnings: string[];
}

// ── Analyzer ────────────────────────────────────────────────────────────────

/**
 * Analyze a pipeline before execution — predict tokens, cost, time.
 * Like a compiler analyzing a program before running it.
 *
 * Usage:
 *   const report = analyze(myPipeline);
 *   console.log(report.estimatedCost);
 */
export function analyze(pipeline: PipelineDef): PipelineAnalysis {
  const steps = extractAllSteps(pipeline);
  const llmSteps = steps.filter((s) => !s.deterministic);
  const detSteps = steps.filter((s) => s.deterministic);
  const controlFlowNodes = pipeline.nodes.filter((n) => n.type !== "step").length;

  // Estimate tokens per LLM step
  let totalInputMin = 0;
  let totalInputExpected = 0;
  let totalInputMax = 0;
  let totalOutputMin = 0;
  let totalOutputExpected = 0;
  let totalOutputMax = 0;
  let totalRetryMultiplier = 1;
  const allTools: string[] = [];
  const warnings: string[] = [];

  for (const s of llmSteps) {
    const promptTokens = estimatePromptTokens(s);
    const outputTokens = estimateOutputTokens(s);

    totalInputMin += promptTokens * 0.8;
    totalInputExpected += promptTokens;
    totalInputMax += promptTokens * 1.5;
    totalOutputMin += outputTokens * 0.5;
    totalOutputExpected += outputTokens;
    totalOutputMax += outputTokens * 2;

    if (s.retry) {
      totalRetryMultiplier = Math.max(totalRetryMultiplier, s.retry.maxAttempts);
    }
    if (s.tools) {
      allTools.push(...s.tools);
    }

    // Warnings
    if (!s.outputSchema && s.promptTemplate) {
      warnings.push(`Step "${s.id}" has no output schema — output won't be validated`);
    }
    if (!s.retry && s.promptTemplate) {
      warnings.push(`Step "${s.id}" has no retry config — single attempt only`);
    }
    if (!s.fallback && s.retry && s.retry.maxAttempts > 1) {
      warnings.push(`Step "${s.id}" has retry but no fallback step`);
    }
  }

  // Cost per model
  const estimatedCost: Record<string, { perRun: number; withRetries: number }> = {};
  for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
    if (model === "default") continue;
    const inputCost = (totalInputExpected / 1_000_000) * pricing.input;
    const outputCost = (totalOutputExpected / 1_000_000) * pricing.output;
    const perRun = inputCost + outputCost;
    estimatedCost[model] = {
      perRun: round(perRun),
      withRetries: round(perRun * totalRetryMultiplier),
    };
  }

  // Time estimate: tool-enabled steps (~45s avg), simple prompt steps (~5s avg)
  let sequentialMs = 0;
  for (const s of llmSteps) {
    const hasTools = s.tools && s.tools.length > 0;
    sequentialMs += hasTools ? 45_000 : 5_000;
  }
  sequentialMs += detSteps.length * 1;
  const withRetriesMs = sequentialMs * totalRetryMultiplier;

  return {
    pipelineName: pipeline.name,
    stepCount: steps.length,
    llmStepCount: llmSteps.length,
    deterministicStepCount: detSteps.length,
    controlFlowNodes,
    estimatedTokens: {
      input: { min: Math.round(totalInputMin), expected: Math.round(totalInputExpected), max: Math.round(totalInputMax) },
      output: { min: Math.round(totalOutputMin), expected: Math.round(totalOutputExpected), max: Math.round(totalOutputMax) },
    },
    estimatedCost,
    estimatedDuration: {
      sequentialMs,
      withRetriesMs,
    },
    requiredTools: [...new Set(allTools)],
    schemaWarnings: warnings,
  };
}

/**
 * Format analysis as a human-readable string for terminal output.
 */
export function formatAnalysis(analysis: PipelineAnalysis): string {
  const lines: string[] = [];
  lines.push(`Pipeline: ${analysis.pipelineName}`);
  lines.push(`Steps: ${analysis.stepCount} (${analysis.llmStepCount} LLM, ${analysis.deterministicStepCount} deterministic)`);
  if (analysis.controlFlowNodes > 0) {
    lines.push(`Control flow: ${analysis.controlFlowNodes} nodes (loop/branch/map)`);
  }
  lines.push("");
  lines.push("Token estimate:");
  lines.push(`  Input:  ~${analysis.estimatedTokens.input.expected} (${analysis.estimatedTokens.input.min}-${analysis.estimatedTokens.input.max})`);
  lines.push(`  Output: ~${analysis.estimatedTokens.output.expected} (${analysis.estimatedTokens.output.min}-${analysis.estimatedTokens.output.max})`);
  lines.push("");
  lines.push("Cost estimate:");
  for (const [model, cost] of Object.entries(analysis.estimatedCost)) {
    lines.push(`  ${model}: $${cost.perRun.toFixed(4)}/run ($${cost.withRetries.toFixed(4)} with retries)`);
  }
  lines.push("");
  lines.push(`Time estimate: ~${(analysis.estimatedDuration.sequentialMs / 1000).toFixed(1)}s (~${(analysis.estimatedDuration.withRetriesMs / 1000).toFixed(1)}s with retries)`);

  if (analysis.requiredTools.length > 0) {
    lines.push("");
    lines.push(`Required tools: ${analysis.requiredTools.join(", ")}`);
  }

  if (analysis.schemaWarnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of analysis.schemaWarnings) {
      lines.push(`  - ${w}`);
    }
  }

  return lines.join("\n");
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractAllSteps(pipeline: PipelineDef): StepDef[] {
  const steps: StepDef[] = [];
  for (const node of pipeline.nodes) {
    switch (node.type) {
      case "step":
        steps.push(node.step);
        break;
      case "loop":
        steps.push(node.loop.step);
        break;
      case "branch":
        steps.push(node.branch.trueBranch);
        steps.push(node.branch.falseBranch);
        break;
      case "map":
        steps.push(node.map.step);
        break;
    }
  }
  return steps;
}

function estimatePromptTokens(step: StepDef): number {
  let tokens = 0;
  // System prompt tokens
  if (step.systemPrompt) {
    tokens += Math.ceil(step.systemPrompt.length / 4);
  }
  // Prompt template tokens (approximate — variables will be filled at runtime)
  if (step.promptTemplate) {
    tokens += Math.ceil(step.promptTemplate.length / 4);
    // Add overhead for variable interpolation (variables are usually replaced with longer text)
    const varCount = (step.promptTemplate.match(/\{[^}]+\}/g) ?? []).length;
    tokens += varCount * 50; // assume ~50 tokens per interpolated variable
  }
  // Base overhead (Claude system context)
  tokens += 200;
  return tokens;
}

function estimateOutputTokens(step: StepDef): number {
  if (!step.outputSchema) return 200; // default estimate

  // Estimate from schema shape
  const def = (step.outputSchema as { _def?: { shape?: () => Record<string, unknown> } })._def;
  if (def?.shape) {
    const fieldCount = Object.keys(def.shape()).length;
    return fieldCount * 30; // ~30 tokens per field
  }
  return 150;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
