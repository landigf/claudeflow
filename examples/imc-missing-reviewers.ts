#!/usr/bin/env npx tsx
/**
 * Run the missing IMC reviewers (chair + methodology) against the paper
 * and save both JSON trace output and a readable markdown review file.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadYaml, analyze, formatAnalysis, ClaudeCliRuntime, CheckpointManager } from "../src/index.js";
import { createToolRegistry } from "../src/tools/index.js";

const PAPER_DIR = "/Users/landigf/Desktop/Code/Research/SpotAIfy/research/agent-traffic/paper";

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║  ClaudeFlow → Missing IMC Reviewers                         ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`\nPaper: ${PAPER_DIR}\n`);

const p = loadYaml(path.join(import.meta.dirname, "../pipelines/imc-missing-reviewers.yaml"));

console.log("=== Analysis ===\n");
console.log(formatAnalysis(analyze(p)));
console.log("");

const runtime = new ClaudeCliRuntime({
  cwd: PAPER_DIR,
  permissionMode: "plan",
  defaultTimeoutMs: 1_200_000,
});

const tools = createToolRegistry();
const checkpoint = new CheckpointManager(path.join(import.meta.dirname, "../.claudeflow/imc-missing-reviewers/checkpoints"));

console.log("=== Running Missing Reviewers ===\n");
const result = await p.run({}, { runtime, verbose: true, tools, checkpoint });
const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");

const tracePath = path.join(import.meta.dirname, `../traces/imc-missing-reviewers-${stamp}.json`);
writeFileSync(tracePath, JSON.stringify({
  ...result.trace,
  startedAt: result.trace.startedAt.toISOString(),
  finishedAt: result.trace.finishedAt.toISOString(),
}, null, 2));

const reviewPath = path.join(import.meta.dirname, `../traces/imc-missing-reviewers-${stamp}-reviews.md`);
const reviews = result.trace.steps
  .filter((step) => step.outputSnapshot && typeof step.outputSnapshot === "string")
  .map((step) => `## ${step.stepId}\n\n${step.outputSnapshot}\n\n---\n`)
  .join("\n");
writeFileSync(reviewPath, `# IMC Missing Reviewers\n\n${reviews}`);

console.log(`\nStatus: ${result.trace.status}`);
console.log(`Cost: $${result.trace.totalCostUsd.toFixed(2)}`);
console.log(`Trace: ${tracePath}`);
console.log(`Reviews: ${reviewPath}`);

if (result.trace.status !== "completed") {
  process.exitCode = 1;
}
