#!/usr/bin/env npx tsx
/**
 * Run the paper review pipeline on the AgentWebBench paper.
 * Simulates 3 IMC reviewers + meta-review.
 *
 * Run: npx tsx examples/review-paper.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadYaml, analyze, formatAnalysis, ClaudeCliRuntime } from "../src/index.js";
import { createToolRegistry } from "../src/tools/index.js";

const PAPER_DIR = "/Users/landigf/Desktop/Code/Research/SpotAIfy/research/agent-traffic/paper";

console.log("╔══════════════════════════════════════════╗");
console.log("║  ClaudeFlow → IMC 2026 Paper Review       ║");
console.log("╚══════════════════════════════════════════╝");
console.log(`\nPaper directory: ${PAPER_DIR}\n`);

const p = loadYaml(path.join(import.meta.dirname, "../pipelines/paper-review.yaml"));

console.log("=== Pre-execution Analysis ===\n");
console.log(formatAnalysis(analyze(p)));
console.log("");

const runtime = new ClaudeCliRuntime({
  cwd: PAPER_DIR,
  permissionMode: "plan", // read-only — don't modify the paper
  defaultTimeoutMs: 300_000,
});

const tools = createToolRegistry();

console.log("=== Running 3 Simulated Reviewers + Meta-Review ===\n");
const result = await p.run({}, { runtime, verbose: true, tools });

// Save trace and results
const tracePath = path.join(import.meta.dirname, "../traces", `paper-review-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(tracePath, JSON.stringify({
  ...result.trace,
  startedAt: result.trace.startedAt.toISOString(),
  finishedAt: result.trace.finishedAt.toISOString(),
}, null, 2));

// Save the full review text for easy reading
const reviewPath = path.join(import.meta.dirname, "../traces", `paper-review-${new Date().toISOString().slice(0, 10)}-reviews.md`);
const reviews: string[] = [];
for (const step of result.trace.steps) {
  if (step.outputSnapshot && typeof step.outputSnapshot === "string") {
    reviews.push(`## ${step.stepId}\n\n${step.outputSnapshot}\n`);
  }
}
writeFileSync(reviewPath, reviews.join("\n---\n\n"));

console.log("\n=== Meta-Review ===\n");
console.log(typeof result.output === "string" ? result.output : JSON.stringify(result.output, null, 2));
console.log(`\nTrace: ${tracePath}`);
console.log(`Reviews: ${reviewPath}`);
console.log(`Status: ${result.trace.status}`);
console.log(`Duration: ${(result.trace.totalDurationMs / 1000).toFixed(1)}s`);
console.log(`Cost: $${result.trace.totalCostUsd.toFixed(4)}`);

if (result.trace.status !== "completed") {
  process.exitCode = 1;
}
