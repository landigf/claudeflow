import { nanoid } from "nanoid";
import type { BranchDef } from "../control/branch.js";
import type { LoopDef } from "../control/loop.js";
import type { MapDef } from "../control/map.js";
import type { OptimizeDef } from "../control/optimize.js";
import { interpolate } from "../loader/interpolation.js";
import type { AttemptTrace, PipelineTrace, StepTrace } from "../observability/trace.js";
import type { Runtime, RuntimeResponse } from "../runtime/types.js";
import type { ToolAdapter } from "../tools/index.js";
import { type Context, advanceContext, createContext } from "./context.js";
import type { StepDef } from "./step.js";

class PartialMapError extends Error {
  constructor(
    message: string,
    public readonly traces: StepTrace[],
  ) {
    super(message);
  }
}

export interface PipelineRunOptions {
  runtime: Runtime;
  verbose?: boolean;
  /** Memory store for cross-run persistence */
  memory?: import("../memory/store.js").MemoryStore;
  /** Checkpoint manager for resumable pipelines */
  checkpoint?: import("../memory/checkpoint.js").CheckpointManager;
  /** Tool adapters registry */
  tools?: Map<string, ToolAdapter>;
  onStepStart?: (stepId: string, ctx: Context) => void;
  onStepEnd?: (stepId: string, trace: StepTrace) => void;
  onRetry?: (stepId: string, attempt: number, error: string) => void;
}

export interface PipelineResult {
  output: unknown;
  trace: PipelineTrace;
}

export interface ToolNode {
  id: string;
  adapter: string;
  action: string;
  params: Record<string, unknown>;
}

type PipelineNode =
  | { type: "step"; step: StepDef }
  | { type: "loop"; loop: LoopDef }
  | { type: "branch"; branch: BranchDef }
  | { type: "map"; map: MapDef }
  | { type: "tool"; tool: ToolNode }
  | { type: "optimize"; optimize: OptimizeDef };

export class PipelineDef {
  readonly name: string;
  readonly nodes: PipelineNode[];

  constructor(name: string, nodes: PipelineNode[] = []) {
    this.name = name;
    this.nodes = nodes;
  }

  /** Add a step (LLM or deterministic) */
  step(s: StepDef | { build(): StepDef }): PipelineDef {
    const def = "build" in s && typeof s.build === "function" ? s.build() : (s as StepDef);
    return new PipelineDef(this.name, [...this.nodes, { type: "step", step: def }]);
  }

  /** Add a loop node */
  loop(loopDef: LoopDef): PipelineDef {
    return new PipelineDef(this.name, [...this.nodes, { type: "loop", loop: loopDef }]);
  }

  /** Add a branch node */
  branch(branchDef: BranchDef): PipelineDef {
    return new PipelineDef(this.name, [...this.nodes, { type: "branch", branch: branchDef }]);
  }

  /** Add a map node */
  map(mapDef: MapDef): PipelineDef {
    return new PipelineDef(this.name, [...this.nodes, { type: "map", map: mapDef }]);
  }

  /** Add a tool node (deterministic, no LLM) */
  tool(toolNode: ToolNode): PipelineDef {
    return new PipelineDef(this.name, [...this.nodes, { type: "tool", tool: toolNode }]);
  }

  /** Add an optimize loop (autoresearch pattern) */
  optimize(optimizeDef: OptimizeDef): PipelineDef {
    return new PipelineDef(this.name, [...this.nodes, { type: "optimize", optimize: optimizeDef }]);
  }

  async run(input: unknown, options: PipelineRunOptions): Promise<PipelineResult> {
    let startIndex = 0;
    let runId = nanoid();
    const startedAt = new Date();
    let ctx = createContext(input, runId, this.name);
    const stepTraces: StepTrace[] = [];
    let pipelineStatus: PipelineTrace["status"] = "completed";

    // Check for existing checkpoint to resume from
    if (options.checkpoint) {
      const existing = options.checkpoint.load(this.name);
      if (existing) {
        runId = existing.runId;
        startIndex = existing.completedStepIndex + 1;
        ctx = createContext(existing.input, runId, this.name);
        // Rebuild context state from checkpoint
        for (const [key, value] of Object.entries(existing.contextState)) {
          ctx = advanceContext(ctx, key, value);
        }
        stepTraces.push(...existing.completedTraces);
        if (options.verbose) {
          console.log(
            `[claudeflow] Resuming from step ${startIndex + 1}/${this.nodes.length} (checkpoint: ${runId.slice(0, 8)})`,
          );
        }
      }
    }

    // Inject memory into context if available
    if (options.memory) {
      const memories = options.memory.all();
      if (Object.keys(memories).length > 0) {
        ctx = advanceContext(ctx, "_memory", memories);
      }
    }

    if (options.verbose && startIndex === 0) {
      console.log(`[claudeflow] ${this.name}`);
      console.log(`[claudeflow] Runtime: ${options.runtime.constructor.name}`);
      if (options.memory)
        console.log(`[claudeflow] Memory: ${options.memory.keys().length} entries loaded`);
      if (options.checkpoint) console.log("[claudeflow] Checkpointing enabled");
      console.log("");
    }

    for (let i = startIndex; i < this.nodes.length; i++) {
      const node = this.nodes[i];

      try {
        const result = await this.#executeNode(node, ctx, options, i);
        stepTraces.push(...result.traces);
        ctx = result.ctx;

        // Save checkpoint after each successful step
        if (options.checkpoint) {
          options.checkpoint.save(runId, {
            runId,
            pipelineName: this.name,
            status: "in_progress",
            completedStepIndex: i,
            contextState: { ...ctx.state },
            input,
            completedTraces: [...stepTraces],
            createdAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        if (error instanceof PartialMapError) {
          stepTraces.push(...error.traces);
          pipelineStatus = error.traces.some((t) => t.status === "completed")
            ? "partial"
            : "failed";
        } else {
          const nodeId = getNodeId(node);
          stepTraces.push({
            stepId: nodeId,
            stepName: nodeId,
            status: "failed",
            durationMs: 0,
            attempts: [],
            inputSnapshot: ctx.state,
            outputSnapshot: undefined,
          });
          pipelineStatus = "failed";
        }
        // Save failure checkpoint so we can resume
        if (options.checkpoint) {
          options.checkpoint.fail(runId, (error as Error).message);
        }
        if (options.verbose) {
          console.log(`  ✗ ${(error as Error).message?.slice(0, 100)}`);
        }
        break;
      }
    }

    const finishedAt = new Date();
    const totalTokens = sumTokens(stepTraces);
    const totalCost = sumCost(stepTraces);
    const trace: PipelineTrace = {
      runId,
      pipelineName: this.name,
      status: pipelineStatus,
      startedAt,
      finishedAt,
      totalDurationMs: finishedAt.getTime() - startedAt.getTime(),
      totalTokens,
      totalCostUsd: totalCost,
      steps: stepTraces,
    };

    // Mark checkpoint completed
    if (options.checkpoint && pipelineStatus === "completed") {
      options.checkpoint.complete(runId);
    }

    if (options.verbose) {
      console.log("");
      console.log(
        `[claudeflow] ${pipelineStatus === "completed" ? "✓" : "✗"} ${pipelineStatus} in ${trace.totalDurationMs}ms`,
      );
      console.log(
        `[claudeflow] Tokens: ${totalTokens.inputTokens} in / ${totalTokens.outputTokens} out`,
      );
      console.log(`[claudeflow] Cost: $${totalCost.toFixed(4)}`);
    }

    const lastOutput = stepTraces.at(-1)?.outputSnapshot;
    return { output: lastOutput, trace };
  }

  async #executeNode(
    node: PipelineNode,
    ctx: Context,
    options: PipelineRunOptions,
    nodeIndex: number,
  ): Promise<{ traces: StepTrace[]; ctx: Context }> {
    switch (node.type) {
      case "step":
        return this.#executeStepNode(node.step, ctx, options, nodeIndex);
      case "loop":
        return this.#executeLoopNode(node.loop, ctx, options, nodeIndex);
      case "branch":
        return this.#executeBranchNode(node.branch, ctx, options, nodeIndex);
      case "map":
        return this.#executeMapNode(node.map, ctx, options, nodeIndex);
      case "tool":
        return this.#executeToolNode(node.tool, ctx, options, nodeIndex);
      case "optimize":
        return this.#executeOptimizeNode(node.optimize, ctx, options, nodeIndex);
    }
  }

  async #executeStepNode(
    stepDef: StepDef,
    ctx: Context,
    options: PipelineRunOptions,
    nodeIndex: number,
  ): Promise<{ traces: StepTrace[]; ctx: Context }> {
    options.onStepStart?.(stepDef.id, ctx);
    if (options.verbose) {
      process.stdout.write(`[${nodeIndex + 1}/${this.nodes.length}] ${stepDef.id} `);
    }

    const trace = await this.#executeStep(stepDef, ctx, options);
    const nextCtx =
      trace.status === "completed" && trace.outputSnapshot !== undefined
        ? advanceContext(ctx, stepDef.id, trace.outputSnapshot)
        : ctx;

    if (options.verbose) {
      const tokens = trace.attempts.reduce(
        (s, a) => s + a.usage.inputTokens + a.usage.outputTokens,
        0,
      );
      if (stepDef.deterministic) {
        console.log(`✓ ${trace.durationMs}ms (deterministic)`);
      } else {
        console.log(`✓ ${trace.durationMs}ms  ${tokens} tokens`);
      }
    }

    options.onStepEnd?.(stepDef.id, trace);
    return { traces: [trace], ctx: nextCtx };
  }

  async #executeLoopNode(
    loopDef: LoopDef,
    ctx: Context,
    options: PipelineRunOptions,
    nodeIndex: number,
  ): Promise<{ traces: StepTrace[]; ctx: Context }> {
    const traces: StepTrace[] = [];
    const label = loopDef.config.label ?? loopDef.step.id;
    let loopCtx = ctx;

    for (let iteration = 0; iteration < loopDef.config.maxIterations; iteration++) {
      if (options.verbose) {
        process.stdout.write(
          `[${nodeIndex + 1}/${this.nodes.length}] ${label} (iter ${iteration + 1}) `,
        );
      }

      const trace = await this.#executeStep(loopDef.step, loopCtx, options);
      traces.push(trace);

      if (trace.status === "completed" && trace.outputSnapshot !== undefined) {
        loopCtx = advanceContext(loopCtx, loopDef.step.id, trace.outputSnapshot);
      }

      if (options.verbose) {
        console.log(`✓ ${trace.durationMs}ms`);
      }

      // Check exit condition
      if (loopDef.condition(loopCtx)) {
        if (options.verbose) {
          console.log(`  loop "${label}" done after ${iteration + 1} iterations`);
        }
        break;
      }
    }

    return { traces, ctx: loopCtx };
  }

  async #executeBranchNode(
    branchDef: BranchDef,
    ctx: Context,
    options: PipelineRunOptions,
    nodeIndex: number,
  ): Promise<{ traces: StepTrace[]; ctx: Context }> {
    const taken = branchDef.predicate(ctx);
    const stepDef = taken ? branchDef.trueBranch : branchDef.falseBranch;

    if (options.verbose) {
      process.stdout.write(`[${nodeIndex + 1}/${this.nodes.length}] branch → ${stepDef.id} `);
    }

    const trace = await this.#executeStep(stepDef, ctx, options);
    const nextCtx =
      trace.status === "completed" && trace.outputSnapshot !== undefined
        ? advanceContext(ctx, stepDef.id, trace.outputSnapshot)
        : ctx;

    if (options.verbose) {
      console.log(`✓ ${trace.durationMs}ms`);
    }

    return { traces: [trace], ctx: nextCtx };
  }

  async #executeMapNode(
    mapDef: MapDef,
    ctx: Context,
    options: PipelineRunOptions,
    nodeIndex: number,
  ): Promise<{ traces: StepTrace[]; ctx: Context }> {
    // Resolve the array from context using dot notation
    const allVars = { ...(ctx.input as Record<string, unknown>), ...ctx.state };
    const items = resolveDeep(mapDef.arrayKey, allVars);
    if (!Array.isArray(items)) {
      throw new Error(`map: "${mapDef.arrayKey}" is not an array in context`);
    }

    if (options.verbose) {
      console.log(
        `[${nodeIndex + 1}/${this.nodes.length}] map "${mapDef.step.id}" over ${items.length} items`,
      );
    }

    const traces: StepTrace[] = new Array(items.length);
    const results: unknown[] = new Array(items.length);
    const concurrency = mapDef.config.concurrency ?? 1;
    let hasFailure = false;

    // Process items in batches of `concurrency` size
    for (let batchStart = 0; batchStart < items.length; batchStart += concurrency) {
      const batchEnd = Math.min(batchStart + concurrency, items.length);
      const batch = items.slice(batchStart, batchEnd).map(async (item, offset) => {
        const i = batchStart + offset;
        const itemCtx = advanceContext(ctx, "item", item);

        if (options.verbose) {
          process.stdout.write(`  [${i + 1}/${items.length}] `);
        }

        const stepStart = Date.now();
        try {
          const trace = await this.#executeStep(mapDef.step, itemCtx, options);
          traces[i] = trace;
          results[i] = trace.outputSnapshot;

          if (options.verbose) {
            console.log(`✓ ${trace.durationMs}ms`);
          }
        } catch (error) {
          hasFailure = true;
          const message = (error as Error).message ?? "unknown error";
          traces[i] = {
            stepId: mapDef.step.id,
            stepName: mapDef.step.id,
            status: "failed",
            durationMs: Date.now() - stepStart,
            attempts: [],
            inputSnapshot: item,
            outputSnapshot: undefined,
          };
          results[i] = null;

          if (options.verbose) {
            console.log(`✗ ${message.slice(0, 100)}`);
          }
        }
      });

      await Promise.allSettled(batch);
    }

    if (hasFailure) {
      const failed = traces.filter((t) => t.status === "failed").length;
      throw new PartialMapError(
        `map "${mapDef.step.id}": ${failed}/${items.length} items failed`,
        traces,
      );
    }

    // Store map results as array keyed by step id
    const nextCtx = advanceContext(ctx, mapDef.step.id, results);
    return { traces, ctx: nextCtx };
  }

  async #executeToolNode(
    toolNode: ToolNode,
    ctx: Context,
    options: PipelineRunOptions,
    nodeIndex: number,
  ): Promise<{ traces: StepTrace[]; ctx: Context }> {
    const stepStart = Date.now();

    if (options.verbose) {
      process.stdout.write(
        `[${nodeIndex + 1}/${this.nodes.length}] tool:${toolNode.adapter}.${toolNode.action} `,
      );
    }

    const adapter = options.tools?.get(toolNode.adapter);
    if (!adapter) {
      throw new Error(
        `Tool adapter "${toolNode.adapter}" not found. Register it in PipelineRunOptions.tools`,
      );
    }

    // Interpolate params
    const allVars = { ...(ctx.input as Record<string, unknown>), ...ctx.state };
    const interpolatedParams: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(toolNode.params)) {
      if (typeof value === "string") {
        interpolatedParams[key] = interpolate(value, allVars);
      } else {
        interpolatedParams[key] = value;
      }
    }

    const output = await adapter.execute(toolNode.action, interpolatedParams);
    const durationMs = Date.now() - stepStart;

    if (options.verbose) {
      console.log(`✓ ${durationMs}ms (deterministic)`);
    }

    const trace: StepTrace = {
      stepId: toolNode.id,
      stepName: `${toolNode.adapter}.${toolNode.action}`,
      status: "completed",
      durationMs,
      attempts: [], // no LLM attempts
      inputSnapshot: interpolatedParams,
      outputSnapshot: output,
    };

    const nextCtx = advanceContext(ctx, toolNode.id, output);
    return { traces: [trace], ctx: nextCtx };
  }

  async #executeOptimizeNode(
    optimizeDef: OptimizeDef,
    ctx: Context,
    options: PipelineRunOptions,
    nodeIndex: number,
  ): Promise<{ traces: StepTrace[]; ctx: Context }> {
    const config = optimizeDef.config;
    const label = config.label ?? "optimize";
    const traces: StepTrace[] = [];
    let optimizeCtx = ctx;

    if (options.verbose) {
      console.log(
        `[${nodeIndex + 1}/${this.nodes.length}] optimize "${label}" (max ${config.maxIterations} iterations, ${config.direction} is better)`,
      );
    }

    // Get baseline metric
    const baselineTrace = await this.#executeStep(optimizeDef.evalStep, optimizeCtx, options);
    traces.push(baselineTrace);
    if (baselineTrace.outputSnapshot) {
      optimizeCtx = advanceContext(
        optimizeCtx,
        optimizeDef.evalStep.id,
        baselineTrace.outputSnapshot,
      );
    }

    const baselineOutput = baselineTrace.outputSnapshot as Record<string, unknown> | undefined;
    let bestMetric = Number(baselineOutput?.[config.metricKey] ?? 0);
    optimizeCtx = advanceContext(optimizeCtx, "_best_metric", bestMetric);

    if (options.verbose) {
      console.log(`  baseline ${config.metricKey}: ${bestMetric}`);
    }

    const attempts: Array<{ iteration: number; metric: number; kept: boolean }> = [];

    // Git isolation: snapshot state before each iteration, revert on discard
    const useGitIsolation = config.gitIsolation !== false;
    let lastGoodCommit: string | null = null;

    if (useGitIsolation) {
      try {
        const { execSync } = await import("node:child_process");
        const cwd = process.cwd();
        // Record current HEAD as the baseline
        lastGoodCommit = execSync("git rev-parse HEAD", { cwd, encoding: "utf-8" }).trim();
        if (options.verbose) {
          console.log(`  git isolation: baseline at ${lastGoodCommit.slice(0, 8)}`);
        }
      } catch {
        // Not a git repo or git not available — skip isolation
        if (options.verbose) {
          console.log("  git isolation: not available (not a git repo)");
        }
      }
    }

    for (let i = 0; i < config.maxIterations; i++) {
      if (options.verbose) {
        process.stdout.write(`  [${i + 1}/${config.maxIterations}] mutate... `);
      }

      // Mutate
      const mutateTrace = await this.#executeStep(optimizeDef.mutateStep, optimizeCtx, options);
      traces.push(mutateTrace);

      // Git: commit the mutation so we can revert cleanly
      if (useGitIsolation && lastGoodCommit) {
        try {
          const { execSync } = await import("node:child_process");
          const cwd = process.cwd();
          execSync(
            "git add -A && git commit -m 'optimize: experiment' --allow-empty --no-verify 2>/dev/null || true",
            { cwd, encoding: "utf-8" },
          );
        } catch {
          /* ignore */
        }
      }

      // Evaluate
      const evalTrace = await this.#executeStep(optimizeDef.evalStep, optimizeCtx, options);
      traces.push(evalTrace);

      const evalOutput = evalTrace.outputSnapshot as Record<string, unknown> | undefined;
      const newMetric = Number(evalOutput?.[config.metricKey] ?? 0);

      const isBetter =
        config.direction === "lower" ? newMetric < bestMetric : newMetric > bestMetric;

      attempts.push({ iteration: i + 1, metric: newMetric, kept: isBetter });

      if (isBetter) {
        bestMetric = newMetric;
        optimizeCtx = advanceContext(optimizeCtx, "_best_metric", bestMetric);
        optimizeCtx = advanceContext(optimizeCtx, optimizeDef.evalStep.id, evalOutput);
        // Update the "good" commit reference
        if (useGitIsolation) {
          try {
            const { execSync } = await import("node:child_process");
            lastGoodCommit = execSync("git rev-parse HEAD", {
              cwd: process.cwd(),
              encoding: "utf-8",
            }).trim();
          } catch {
            /* ignore */
          }
        }
        if (options.verbose) {
          console.log(`✓ ${config.metricKey}: ${newMetric} (improved, keeping)`);
        }
        if (options.memory) {
          options.memory.set(`optimize_${label}_best`, { metric: bestMetric, iteration: i + 1 });
        }
      } else {
        // Git: revert to last good commit (discard failed experiment)
        if (useGitIsolation && lastGoodCommit) {
          try {
            const { execSync } = await import("node:child_process");
            execSync(`git reset --hard ${lastGoodCommit}`, {
              cwd: process.cwd(),
              encoding: "utf-8",
            });
            if (options.verbose) {
              console.log(
                `✗ ${config.metricKey}: ${newMetric} (reverted to ${lastGoodCommit.slice(0, 8)})`,
              );
            }
          } catch {
            if (options.verbose) {
              console.log(
                `✗ ${config.metricKey}: ${newMetric} (no improvement, git revert failed)`,
              );
            }
          }
        } else {
          if (options.verbose) {
            console.log(`✗ ${config.metricKey}: ${newMetric} (no improvement, discarding)`);
          }
        }
      }
    }

    // Store optimization results as a summary trace
    const summary = {
      bestMetric,
      totalIterations: attempts.length,
      keptCount: attempts.filter((a) => a.kept).length,
      attempts,
    };
    optimizeCtx = advanceContext(optimizeCtx, `${label}_results`, summary);

    // Add a summary trace so result.output captures the optimization results
    traces.push({
      stepId: `${label}_summary`,
      stepName: `optimize:${label}`,
      status: "completed",
      durationMs: 0,
      attempts: [],
      inputSnapshot: { bestMetric, totalIterations: attempts.length },
      outputSnapshot: summary,
    });

    if (options.verbose) {
      const kept = attempts.filter((a) => a.kept).length;
      console.log(
        `  optimize done: ${kept}/${attempts.length} kept, best ${config.metricKey}: ${bestMetric}`,
      );
    }

    return { traces, ctx: optimizeCtx };
  }

  async #executeStep(
    stepDef: StepDef,
    ctx: Context,
    options: PipelineRunOptions,
  ): Promise<StepTrace> {
    const stepStart = Date.now();
    const allVars = { ...(ctx.input as Record<string, unknown>), ...ctx.state };

    // Deterministic step — run the function directly
    if (stepDef.deterministic && stepDef.fn) {
      const input = stepDef.inputSchema ? stepDef.inputSchema.parse(allVars) : allVars;
      const output = await stepDef.fn(input);
      const validated = stepDef.outputSchema ? stepDef.outputSchema.parse(output) : output;
      return {
        stepId: stepDef.id,
        stepName: stepDef.id,
        status: "completed",
        durationMs: Date.now() - stepStart,
        attempts: [],
        inputSnapshot: input,
        outputSnapshot: validated,
      };
    }

    // LLM step — call the runtime with retry
    const maxAttempts = stepDef.retry?.maxAttempts ?? 1;
    const attempts: AttemptTrace[] = [];
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const attemptStart = Date.now();

      if (attempt > 1 && stepDef.retry) {
        const delay = computeBackoff(stepDef.retry, attempt);
        await new Promise((r) => setTimeout(r, delay));
        options.onRetry?.(stepDef.id, attempt, lastError ?? "unknown");
      }

      const prompt = stepDef.promptTemplate ? interpolate(stepDef.promptTemplate, allVars) : "";

      let response: RuntimeResponse;
      try {
        response = await options.runtime.execute({
          prompt,
          systemPrompt: stepDef.systemPrompt,
          outputSchema: stepDef.outputSchema,
          tools: stepDef.tools,
          timeoutMs: stepDef.timeoutMs,
          model: stepDef.model,
          temperature: stepDef.temperature,
        });
      } catch (error) {
        lastError = (error as Error).message;
        attempts.push({
          attemptNumber: attempt,
          prompt,
          response: "",
          usage: { inputTokens: 0, outputTokens: 0 },
          costUsd: null,
          durationMs: Date.now() - attemptStart,
          error: lastError,
        });
        continue;
      }

      // Detect empty results and retry. Empty text almost always means Claude
      // silently wrote a file instead of returning the deliverable — treat as retriable.
      if (!response.text || response.text.trim().length === 0) {
        lastError = `Step "${stepDef.id}" returned empty result (attempt ${attempt}/${maxAttempts})`;
        attempts.push({
          attemptNumber: attempt,
          prompt,
          response: "",
          usage: response.usage,
          costUsd: response.costUsd,
          durationMs: Date.now() - attemptStart,
          error: lastError,
        });
        continue;
      }

      // Parse structured output
      let output: unknown = response.structured ?? response.text;
      if (stepDef.outputSchema && !response.structured) {
        try {
          const parsed = JSON.parse(response.text);
          output = stepDef.outputSchema.parse(parsed);
        } catch {
          const coerced = coerceSingleStringObject(stepDef.outputSchema, response.text);
          if (coerced) {
            output = coerced;
          } else {
            lastError = `Output schema validation failed for step "${stepDef.id}"`;
            attempts.push({
              attemptNumber: attempt,
              prompt,
              response: response.text,
              usage: response.usage,
              costUsd: response.costUsd,
              durationMs: Date.now() - attemptStart,
              error: lastError,
            });
            continue;
          }
        }
      }

      attempts.push({
        attemptNumber: attempt,
        prompt,
        response: response.text,
        usage: response.usage,
        costUsd: response.costUsd,
        durationMs: Date.now() - attemptStart,
      });

      return {
        stepId: stepDef.id,
        stepName: stepDef.id,
        status: "completed",
        durationMs: Date.now() - stepStart,
        attempts,
        inputSnapshot: allVars,
        outputSnapshot: output,
      };
    }

    // All attempts failed — try fallback
    if (stepDef.fallback) {
      return this.#executeStep(stepDef.fallback, ctx, options);
    }

    throw new Error(`Step "${stepDef.id}" failed after ${maxAttempts} attempts: ${lastError}`);
  }
}

function coerceSingleStringObject(schema: StepDef["outputSchema"], text: string): unknown {
  const raw = text.trim();
  if (!schema || raw.length === 0) return undefined;

  const shape = (schema as { _def?: { shape?: () => Record<string, unknown> } })._def?.shape?.();
  if (!shape) return undefined;

  const entries = Object.entries(shape);
  if (entries.length !== 1) return undefined;

  const [key, value] = entries[0];
  const typeName = (value as { _def?: { typeName?: string } })._def?.typeName;
  if (typeName !== "ZodString") return undefined;

  return schema.parse({ [key]: raw });
}

function computeBackoff(config: NonNullable<StepDef["retry"]>, attempt: number): number {
  const base = config.baseDelayMs ?? 1000;
  switch (config.backoff) {
    case "linear":
      return base * attempt;
    case "exponential":
      return base * 2 ** (attempt - 1);
    default:
      return base;
  }
}

function getNodeId(node: PipelineNode): string {
  switch (node.type) {
    case "step":
      return node.step.id;
    case "loop":
      return `loop:${node.loop.step.id}`;
    case "branch":
      return `branch:${node.branch.trueBranch.id}/${node.branch.falseBranch.id}`;
    case "map":
      return `map:${node.map.step.id}`;
    case "tool":
      return `tool:${node.tool.id}`;
    case "optimize":
      return `optimize:${node.optimize.mutateStep.id}`;
  }
}

function sumTokens(traces: StepTrace[]): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const trace of traces) {
    for (const attempt of trace.attempts) {
      inputTokens += attempt.usage.inputTokens;
      outputTokens += attempt.usage.outputTokens;
    }
  }
  return { inputTokens, outputTokens };
}

function sumCost(traces: StepTrace[]): number {
  let total = 0;
  for (const trace of traces) {
    for (const attempt of trace.attempts) {
      total += attempt.costUsd ?? 0;
    }
  }
  return total;
}

function resolveDeep(path: string, obj: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function pipeline(name: string): PipelineDef {
  return new PipelineDef(name);
}
