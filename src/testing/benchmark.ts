import type { PipelineDef, PipelineResult, PipelineRunOptions } from "../core/pipeline.js";

export interface BenchmarkOptions {
  /** Number of runs. Default: 10 */
  runs?: number;
  /** Runtime to use */
  runtime: PipelineRunOptions["runtime"];
}

export interface BenchmarkResult {
  runs: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  duration: {
    avgMs: number;
    minMs: number;
    maxMs: number;
    p50Ms: number;
    p95Ms: number;
  };
  tokens: {
    avgInput: number;
    avgOutput: number;
    totalInput: number;
    totalOutput: number;
  };
  cost: {
    avgUsd: number;
    totalUsd: number;
  };
}

/**
 * Run a pipeline N times and collect statistics.
 * Produces reproducible metrics for reliability analysis.
 *
 * Usage:
 *   const stats = await benchmark(myPipeline, { name: "test" }, { runtime: mock, runs: 50 });
 *   console.log(`Success rate: ${stats.successRate}`);
 */
export async function benchmark(
  pipeline: PipelineDef,
  input: unknown,
  options: BenchmarkOptions,
): Promise<BenchmarkResult> {
  const runs = options.runs ?? 10;
  const results: PipelineResult[] = [];
  const durations: number[] = [];
  let successCount = 0;
  let failureCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  for (let i = 0; i < runs; i++) {
    const result = await pipeline.run(input, { runtime: options.runtime });
    results.push(result);

    durations.push(result.trace.totalDurationMs);
    totalInputTokens += result.trace.totalTokens.inputTokens;
    totalOutputTokens += result.trace.totalTokens.outputTokens;
    totalCost += result.trace.totalCostUsd;

    if (result.trace.status === "completed") {
      successCount++;
    } else {
      failureCount++;
    }
  }

  durations.sort((a, b) => a - b);

  return {
    runs,
    successCount,
    failureCount,
    successRate: successCount / runs,
    duration: {
      avgMs: Math.round(durations.reduce((s, d) => s + d, 0) / runs),
      minMs: durations[0] ?? 0,
      maxMs: durations.at(-1) ?? 0,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
    },
    tokens: {
      avgInput: Math.round(totalInputTokens / runs),
      avgOutput: Math.round(totalOutputTokens / runs),
      totalInput: totalInputTokens,
      totalOutput: totalOutputTokens,
    },
    cost: {
      avgUsd: totalCost / runs,
      totalUsd: totalCost,
    },
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
