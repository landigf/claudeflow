import { nanoid } from "nanoid";
import type { ZodType } from "zod";
import type { Runtime, RuntimeResponse } from "../runtime/types.js";
import type { AttemptTrace, PipelineTrace, StepTrace } from "../observability/trace.js";
import { createContext, advanceContext, type Context } from "./context.js";
import { interpolate } from "../loader/interpolation.js";
import type { StepDef, StepBuilder } from "./step.js";

export interface PipelineRunOptions {
  runtime: Runtime;
  verbose?: boolean;
  onStepStart?: (stepId: string, ctx: Context) => void;
  onStepEnd?: (stepId: string, trace: StepTrace) => void;
  onRetry?: (stepId: string, attempt: number, error: string) => void;
}

export interface PipelineResult {
  output: unknown;
  trace: PipelineTrace;
}

interface PipelineNode {
  type: "step";
  step: StepDef;
}

export class PipelineDef {
  readonly name: string;
  readonly nodes: PipelineNode[];
  readonly _outputSchema?: ZodType;

  constructor(name: string, nodes: PipelineNode[] = [], outputSchema?: ZodType) {
    this.name = name;
    this.nodes = nodes;
    this._outputSchema = outputSchema;
  }

  step(s: StepDef | StepBuilder): PipelineDef {
    const def = "build" in s && typeof s.build === "function" ? s.build() : (s as StepDef);
    return new PipelineDef(this.name, [...this.nodes, { type: "step", step: def }], this._outputSchema);
  }

  output(schema: ZodType): PipelineDef {
    return new PipelineDef(this.name, this.nodes, schema);
  }

  async run(input: unknown, options: PipelineRunOptions): Promise<PipelineResult> {
    const runId = nanoid();
    const startedAt = new Date();
    let ctx = createContext(input, runId, this.name);
    const stepTraces: StepTrace[] = [];
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCost = 0;
    let pipelineStatus: PipelineTrace["status"] = "completed";

    if (options.verbose) {
      console.log(`[claudeflow] ${this.name}`);
      console.log(`[claudeflow] Runtime: ${options.runtime.constructor.name}`);
      console.log("");
    }

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const stepDef = node.step;

      options.onStepStart?.(stepDef.id, ctx);

      if (options.verbose) {
        process.stdout.write(`[${i + 1}/${this.nodes.length}] ${stepDef.id} `);
      }

      try {
        const stepTrace = await this.#executeStep(stepDef, ctx, options);
        stepTraces.push(stepTrace);

        if (stepTrace.status === "completed" && stepTrace.outputSnapshot !== undefined) {
          ctx = advanceContext(ctx, stepDef.id, stepTrace.outputSnapshot);
        }

        for (const attempt of stepTrace.attempts) {
          totalTokensIn += attempt.usage.inputTokens;
          totalTokensOut += attempt.usage.outputTokens;
          totalCost += attempt.costUsd ?? 0;
        }

        if (options.verbose) {
          const dur = stepTrace.durationMs;
          const tokens = stepTrace.attempts.reduce((sum, a) => sum + a.usage.inputTokens + a.usage.outputTokens, 0);
          if (stepDef.deterministic) {
            console.log(`✓ ${dur}ms (deterministic)`);
          } else {
            console.log(`✓ ${dur}ms  ${tokens} tokens  $${totalCost.toFixed(4)}`);
          }
        }

        options.onStepEnd?.(stepDef.id, stepTrace);
      } catch (error) {
        const failedTrace: StepTrace = {
          stepId: stepDef.id,
          stepName: stepDef.id,
          status: "failed",
          durationMs: 0,
          attempts: [],
          inputSnapshot: ctx.state,
          outputSnapshot: undefined,
        };
        stepTraces.push(failedTrace);
        pipelineStatus = "failed";

        if (options.verbose) {
          console.log(`✗ ${(error as Error).message?.slice(0, 100)}`);
        }

        options.onStepEnd?.(stepDef.id, failedTrace);
        break;
      }
    }

    const finishedAt = new Date();
    const trace: PipelineTrace = {
      runId,
      pipelineName: this.name,
      status: pipelineStatus,
      startedAt,
      finishedAt,
      totalDurationMs: finishedAt.getTime() - startedAt.getTime(),
      totalTokens: { inputTokens: totalTokensIn, outputTokens: totalTokensOut },
      totalCostUsd: totalCost,
      steps: stepTraces,
    };

    if (options.verbose) {
      console.log("");
      console.log(`[claudeflow] ${pipelineStatus === "completed" ? "✓" : "✗"} ${pipelineStatus} in ${trace.totalDurationMs}ms`);
      console.log(`[claudeflow] Tokens: ${totalTokensIn} in / ${totalTokensOut} out`);
      console.log(`[claudeflow] Cost: $${totalCost.toFixed(4)}`);
    }

    const lastOutput = stepTraces.at(-1)?.outputSnapshot;
    return { output: lastOutput, trace };
  }

  async #executeStep(
    stepDef: StepDef,
    ctx: Context,
    options: PipelineRunOptions,
  ): Promise<StepTrace> {
    const stepStart = Date.now();

    // Deterministic step — run the function directly
    if (stepDef.deterministic && stepDef.fn) {
      const allVars = { ...(ctx.input as Record<string, unknown>), ...ctx.state };
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

    // LLM step — call the runtime
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

      const allVars = { ...(ctx.input as Record<string, unknown>), ...ctx.state };
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

      // Parse structured output
      let output: unknown = response.structured ?? response.text;
      if (stepDef.outputSchema && !response.structured) {
        try {
          const parsed = JSON.parse(response.text);
          output = stepDef.outputSchema.parse(parsed);
        } catch {
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
        inputSnapshot: ctx.state,
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

export function pipeline(name: string): PipelineDef {
  return new PipelineDef(name);
}
