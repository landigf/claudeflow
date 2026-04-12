#!/usr/bin/env npx tsx
/**
 * Run the 8-expert IMC acceptance crew on the AgentWebBench paper.
 * This is the comprehensive review — every dimension IMC evaluates.
 *
 * Run: npx tsx examples/imc-crew.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadYaml, analyze, formatAnalysis, ClaudeCliRuntime } from "../src/index.js";
import { createToolRegistry } from "../src/tools/index.js";

const PAPER_DIR = "/Users/landigf/Desktop/Code/Research/SpotAIfy/research/agent-traffic/paper";

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║  ClaudeFlow → 8-Expert IMC Acceptance Crew                   ║");
console.log("║  Target: Strong Accept (4+/5) at ACM IMC 2026                ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`\nPaper: ${PAPER_DIR}`);
console.log(`Deadline: Abstract Apr 22, Paper Apr 29\n`);

const p = loadYaml(path.join(import.meta.dirname, "../pipelines/imc-acceptance-crew.yaml"));

console.log("=== Analysis ===\n");
console.log(formatAnalysis(analyze(p)));
console.log("");

const runtime = new ClaudeCliRuntime({
  cwd: PAPER_DIR,
  permissionMode: "plan",
  defaultTimeoutMs: 600_000, // 10 min per agent (they need to read full paper + prior reviews)
});

const tools = createToolRegistry();

console.log("=== Running 8 Expert Agents ===\n");
const startTime = Date.now();
const result = await p.run({}, { runtime, verbose: true, tools });

// Save trace
const tracePath = path.join(import.meta.dirname, `../traces/imc-crew-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(tracePath, JSON.stringify({
  ...result.trace,
  startedAt: result.trace.startedAt.toISOString(),
  finishedAt: result.trace.finishedAt.toISOString(),
}, null, 2));

// Save readable reviews
const reviewPath = path.join(import.meta.dirname, `../traces/imc-crew-${new Date().toISOString().slice(0, 10)}-reviews.md`);
const reviews: string[] = ["# IMC 2026 — 8-Expert Review Crew\n"];
for (const step of result.trace.steps) {
  if (step.outputSnapshot && typeof step.outputSnapshot === "string") {
    reviews.push(`## ${step.stepId}\n\n${step.outputSnapshot}\n\n---\n`);
  }
}
writeFileSync(reviewPath, reviews.join("\n"));

const totalMin = ((Date.now() - startTime) / 60000).toFixed(1);
console.log(`\n${"=".repeat(60)}`);
console.log(`Total time: ${totalMin} minutes`);
console.log(`Total cost: $${result.trace.totalCostUsd.toFixed(2)}`);
console.log(`Trace: ${tracePath}`);
console.log(`Reviews: ${reviewPath}`);
console.log(`Status: ${result.trace.status}`);
