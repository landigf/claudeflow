import type { PipelineDef, ToolNode } from "../core/pipeline.js";
import type { StepDef } from "../core/step.js";

// ── Model Pricing (USD per 1M tokens, heuristic planning only) ─────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 0.8, output: 4.0 },
  default: { input: 3.0, output: 15.0 },
};

type StepOrigin =
  | "linear"
  | "loop"
  | "branch-true"
  | "branch-false"
  | "map"
  | "optimize-mutate"
  | "optimize-evaluate"
  | "tool";

interface StepStaticAnalysis {
  id: string;
  deterministic: boolean;
  origin: StepOrigin;
  promptTokens: number;
  outputTokens: number;
  retryMaxAttempts: number;
  model?: string;
  tools: string[];
}

// ── Analysis Types ──────────────────────────────────────────────────────────

export interface PipelineAnalysis {
  pipelineName: string;
  stepCount: number;
  llmStepCount: number;
  deterministicStepCount: number;
  controlFlowNodes: number;
  toolNodeCount: number;
  branchCount: number;
  loopCount: number;
  mapCount: number;
  optimizeCount: number;

  estimatedTokens: {
    input: { min: number; expected: number; max: number };
    output: { min: number; expected: number; max: number };
  };

  estimatedCost: Record<string, { perRun: number; withRetries: number }>;

  // Retained for backward compatibility. Runtime is too input/tool dependent to
  // predict meaningfully here, so the analyzer intentionally leaves these at 0.
  estimatedDuration: {
    sequentialMs: number;
    withRetriesMs: number;
  };

  requiredTools: string[];
  schemaWarnings: string[];
  modelBreakdown: Record<string, number>;
  runtimePredictability: "high" | "medium" | "low";
  assumptions: string[];
}

// ── Analyzer ────────────────────────────────────────────────────────────────

/**
 * Analyze a pipeline before execution.
 *
 * This is a static planner, not a runtime predictor. It inspects pipeline
 * structure, prompt footprint, model assignments, and risk factors. It does
 * not try to predict exact wall-clock time.
 */
export function analyze(pipeline: PipelineDef): PipelineAnalysis {
  const summary = collectStaticSummary(pipeline);
  const llmSteps = summary.steps.filter((s) => !s.deterministic);
  const deterministicSteps = summary.steps.filter((s) => s.deterministic);

  let totalInputMin = 0;
  let totalInputExpected = 0;
  let totalInputMax = 0;
  let totalOutputMin = 0;
  let totalOutputExpected = 0;
  let totalOutputMax = 0;
  const requiredTools = new Set<string>();
  const modelBreakdown: Record<string, number> = {};
  const warnings = [...summary.warnings];

  let hasRetry = false;
  let hasToolEnabledLlm = false;
  let hasUnpinnedModel = false;

  for (const step of llmSteps) {
    totalInputMin += step.promptTokens * 0.8;
    totalInputExpected += step.promptTokens;
    totalInputMax += step.promptTokens * 1.5;
    totalOutputMin += step.outputTokens * 0.5;
    totalOutputExpected += step.outputTokens;
    totalOutputMax += step.outputTokens * 2;

    for (const tool of step.tools) requiredTools.add(tool);
    if (step.tools.length > 0) hasToolEnabledLlm = true;
    if (step.retryMaxAttempts > 1) hasRetry = true;

    const bucket = step.model ?? "<runtime-default>";
    modelBreakdown[bucket] = (modelBreakdown[bucket] ?? 0) + 1;
    if (!step.model) hasUnpinnedModel = true;
    if (step.model && !MODEL_PRICING[step.model]) {
      warnings.push(`Step "${step.id}" uses unknown model "${step.model}" - priced with default rates only`);
    }
  }

  const estimatedCost = buildPricingScenarios(llmSteps, hasUnpinnedModel);

  if (hasToolEnabledLlm) {
    warnings.push("Tool-enabled LLM steps can expand context and runtime significantly - treat cost as a lower bound");
  }
  if (summary.loopCount > 0) {
    warnings.push("Loop nodes are input-dependent - token and price totals include one body pass, not worst-case iteration counts");
  }
  if (summary.mapCount > 0) {
    warnings.push("Map nodes have data-dependent fanout - token and price totals exclude collection-size amplification");
  }
  if (summary.branchCount > 0) {
    warnings.push("Branch nodes are path-sensitive - static totals include both branches for footprint inspection");
  }
  if (summary.optimizeCount > 0) {
    warnings.push("Optimize nodes are feedback-driven - mutate/evaluate bodies are counted once, not per optimization iteration");
  }

  const runtimePredictability = classifyPredictability({
    branchCount: summary.branchCount,
    loopCount: summary.loopCount,
    mapCount: summary.mapCount,
    optimizeCount: summary.optimizeCount,
    hasToolEnabledLlm,
    hasRetry,
  });

  return {
    pipelineName: pipeline.name,
    stepCount: summary.steps.length,
    llmStepCount: llmSteps.length,
    deterministicStepCount: deterministicSteps.length,
    controlFlowNodes: summary.controlFlowNodes,
    toolNodeCount: summary.toolNodeCount,
    branchCount: summary.branchCount,
    loopCount: summary.loopCount,
    mapCount: summary.mapCount,
    optimizeCount: summary.optimizeCount,
    estimatedTokens: {
      input: {
        min: Math.round(totalInputMin),
        expected: Math.round(totalInputExpected),
        max: Math.round(totalInputMax),
      },
      output: {
        min: Math.round(totalOutputMin),
        expected: Math.round(totalOutputExpected),
        max: Math.round(totalOutputMax),
      },
    },
    estimatedCost,
    estimatedDuration: {
      sequentialMs: 0,
      withRetriesMs: 0,
    },
    requiredTools: [...requiredTools],
    schemaWarnings: dedupe(warnings),
    modelBreakdown,
    runtimePredictability,
    assumptions: buildAssumptions({ hasUnpinnedModel, hasToolEnabledLlm }),
  };
}

/**
 * Format analysis as readable static planning text for terminal output.
 */
export function formatAnalysis(analysis: PipelineAnalysis): string {
  const lines: string[] = [];
  lines.push(`Pipeline: ${analysis.pipelineName}`);
  lines.push(`Steps: ${analysis.stepCount} executable units (${analysis.llmStepCount} LLM, ${analysis.deterministicStepCount} deterministic)`);
  if (analysis.controlFlowNodes > 0 || analysis.toolNodeCount > 0) {
    const parts: string[] = [];
    if (analysis.branchCount > 0) parts.push(`${analysis.branchCount} branch`);
    if (analysis.loopCount > 0) parts.push(`${analysis.loopCount} loop`);
    if (analysis.mapCount > 0) parts.push(`${analysis.mapCount} map`);
    if (analysis.optimizeCount > 0) parts.push(`${analysis.optimizeCount} optimize`);
    if (analysis.toolNodeCount > 0) parts.push(`${analysis.toolNodeCount} tool node`);
    lines.push(`Structure: ${parts.join(", ")}`);
  }

  lines.push("");
  lines.push("Prompt footprint heuristic:");
  lines.push(`  Input:  ~${analysis.estimatedTokens.input.expected} (${analysis.estimatedTokens.input.min}-${analysis.estimatedTokens.input.max})`);
  lines.push(`  Output: ~${analysis.estimatedTokens.output.expected} (${analysis.estimatedTokens.output.min}-${analysis.estimatedTokens.output.max})`);

  if (Object.keys(analysis.modelBreakdown).length > 0) {
    lines.push("");
    lines.push("Model assignment:");
    for (const [model, count] of Object.entries(analysis.modelBreakdown)) {
      lines.push(`  ${model}: ${count} step(s)`);
    }
  }

  if (Object.keys(analysis.estimatedCost).length > 0) {
    lines.push("");
    lines.push("Pricing scenarios (heuristic):");
    for (const [label, cost] of Object.entries(analysis.estimatedCost)) {
      lines.push(`  ${formatScenarioLabel(label)}: $${cost.perRun.toFixed(4)} baseline, $${cost.withRetries.toFixed(4)} retry upper bound`);
    }
  }

  lines.push("");
  lines.push(`Runtime predictability: ${analysis.runtimePredictability}`);

  if (analysis.requiredTools.length > 0) {
    lines.push("");
    lines.push(`Required tools: ${analysis.requiredTools.join(", ")}`);
  }

  if (analysis.schemaWarnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of analysis.schemaWarnings) {
      lines.push(`  - ${warning}`);
    }
  }

  if (analysis.assumptions.length > 0) {
    lines.push("");
    lines.push("Assumptions:");
    for (const assumption of analysis.assumptions) {
      lines.push(`  - ${assumption}`);
    }
  }

  return lines.join("\n");
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function collectStaticSummary(pipeline: PipelineDef): {
  steps: StepStaticAnalysis[];
  warnings: string[];
  controlFlowNodes: number;
  toolNodeCount: number;
  branchCount: number;
  loopCount: number;
  mapCount: number;
  optimizeCount: number;
} {
  const steps: StepStaticAnalysis[] = [];
  const warnings: string[] = [];
  let controlFlowNodes = 0;
  let toolNodeCount = 0;
  let branchCount = 0;
  let loopCount = 0;
  let mapCount = 0;
  let optimizeCount = 0;

  for (const node of pipeline.nodes) {
    switch (node.type) {
      case "step":
        steps.push(summarizeStep(node.step, "linear", warnings));
        break;
      case "tool":
        toolNodeCount += 1;
        steps.push(summarizeToolNode(node.tool));
        warnings.push(`Tool node "${node.tool.id}" is deterministic but its runtime depends on the external command/service it calls`);
        break;
      case "loop":
        controlFlowNodes += 1;
        loopCount += 1;
        steps.push(summarizeStep(node.loop.step, "loop", warnings));
        warnings.push(`Loop "${node.loop.config.label ?? node.loop.step.id}" can run up to ${node.loop.config.maxIterations} times`);
        break;
      case "branch":
        controlFlowNodes += 1;
        branchCount += 1;
        steps.push(summarizeStep(node.branch.trueBranch, "branch-true", warnings));
        steps.push(summarizeStep(node.branch.falseBranch, "branch-false", warnings));
        warnings.push(`Branch node includes 2 possible paths; only one executes at runtime`);
        break;
      case "map":
        controlFlowNodes += 1;
        mapCount += 1;
        steps.push(summarizeStep(node.map.step, "map", warnings));
        warnings.push(`Map "${node.map.step.id}" fans out over "{${node.map.arrayKey}}" and cannot be sized statically`);
        break;
      case "optimize":
        controlFlowNodes += 1;
        optimizeCount += 1;
        steps.push(summarizeStep(node.optimize.mutateStep, "optimize-mutate", warnings));
        steps.push(summarizeStep(node.optimize.evalStep, "optimize-evaluate", warnings));
        warnings.push(`Optimize node can iterate up to ${node.optimize.config.maxIterations} times based on feedback`);
        break;
    }
  }

  return {
    steps,
    warnings,
    controlFlowNodes,
    toolNodeCount,
    branchCount,
    loopCount,
    mapCount,
    optimizeCount,
  };
}

function summarizeStep(step: StepDef, origin: StepOrigin, warnings: string[]): StepStaticAnalysis {
  if (!step.outputSchema && step.promptTemplate) {
    warnings.push(`Step "${step.id}" has no output schema - output will not be validated`);
  }
  if (!step.retry && step.promptTemplate) {
    warnings.push(`Step "${step.id}" has no retry config - one failed LLM call ends that step`);
  }
  if (!step.fallback && step.retry && step.retry.maxAttempts > 1) {
    warnings.push(`Step "${step.id}" retries without a fallback step`);
  }

  return {
    id: step.id,
    deterministic: Boolean(step.deterministic),
    origin,
    promptTokens: step.deterministic ? 0 : estimatePromptTokens(step),
    outputTokens: step.deterministic ? 0 : estimateOutputTokens(step),
    retryMaxAttempts: step.retry?.maxAttempts ?? 1,
    model: step.model,
    tools: step.tools ?? [],
  };
}

function summarizeToolNode(tool: ToolNode): StepStaticAnalysis {
  return {
    id: tool.id,
    deterministic: true,
    origin: "tool",
    promptTokens: 0,
    outputTokens: 0,
    retryMaxAttempts: 1,
    model: undefined,
    tools: [],
  };
}

function buildPricingScenarios(
  steps: StepStaticAnalysis[],
  hasUnpinnedModel: boolean,
): Record<string, { perRun: number; withRetries: number }> {
  if (steps.length === 0) return {};

  const scenarios: Record<string, { perRun: number; withRetries: number }> = {};
  scenarios["configured/default"] = priceSteps(steps, MODEL_PRICING.default, false);

  if (hasUnpinnedModel) {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      if (model === "default") continue;
      scenarios[`if-unpinned=${model}`] = priceSteps(steps, pricing, true);
    }
  }

  return scenarios;
}

function priceSteps(
  steps: StepStaticAnalysis[],
  fallbackPricing: { input: number; output: number },
  useScenarioForUnpinned: boolean,
): { perRun: number; withRetries: number } {
  let perRun = 0;
  let withRetries = 0;

  for (const step of steps) {
    const pricing = step.model && MODEL_PRICING[step.model]
      ? MODEL_PRICING[step.model]
      : useScenarioForUnpinned
        ? fallbackPricing
        : MODEL_PRICING.default;

    const stepCost = (step.promptTokens / 1_000_000) * pricing.input
      + (step.outputTokens / 1_000_000) * pricing.output;
    perRun += stepCost;
    withRetries += stepCost * step.retryMaxAttempts;
  }

  return { perRun: round(perRun), withRetries: round(withRetries) };
}

function buildAssumptions(opts: { hasUnpinnedModel: boolean; hasToolEnabledLlm: boolean }): string[] {
  const assumptions = [
    "Prompt footprint is derived from static prompt templates and schemas only",
    "Interpolated runtime values can be much larger than the placeholders visible in YAML/TypeScript",
  ];

  if (opts.hasUnpinnedModel) {
    assumptions.push("Unpinned LLM steps are priced as configured/default and also shown under alternate model scenarios");
  }
  if (opts.hasToolEnabledLlm) {
    assumptions.push("Tool transcripts, file reads, and command output are not modeled precisely in static token totals");
  }

  return assumptions;
}

function classifyPredictability(opts: {
  branchCount: number;
  loopCount: number;
  mapCount: number;
  optimizeCount: number;
  hasToolEnabledLlm: boolean;
  hasRetry: boolean;
}): "high" | "medium" | "low" {
  const riskScore =
    opts.branchCount
    + opts.loopCount * 2
    + opts.mapCount * 3
    + opts.optimizeCount * 3
    + (opts.hasToolEnabledLlm ? 2 : 0)
    + (opts.hasRetry ? 1 : 0);

  if (riskScore >= 4) return "low";
  if (riskScore >= 1) return "medium";
  return "high";
}

function estimatePromptTokens(step: StepDef): number {
  let tokens = 0;
  if (step.systemPrompt) tokens += Math.ceil(step.systemPrompt.length / 4);
  if (step.promptTemplate) {
    tokens += Math.ceil(step.promptTemplate.length / 4);
    const variableCount = (step.promptTemplate.match(/\{[^}]+\}/g) ?? []).length;
    tokens += variableCount * 50;
  }
  tokens += 200;
  return tokens;
}

function estimateOutputTokens(step: StepDef): number {
  if (!step.outputSchema) return 200;

  const def = (step.outputSchema as { _def?: { shape?: () => Record<string, unknown> } })._def;
  if (def?.shape) {
    return Object.keys(def.shape()).length * 30;
  }
  return 150;
}

function formatScenarioLabel(label: string): string {
  if (label === "configured/default") {
    return "configured/default pricing";
  }
  const match = label.match(/^if-unpinned=(.+)$/);
  if (match) {
    return `if unpinned steps use ${match[1]}`;
  }
  return label;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
