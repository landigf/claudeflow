#!/usr/bin/env npx tsx
/**
 * Run the full 8-expert IMC crew on the revised paper and save the results
 * under a post-revision-specific prefix so earlier review runs are preserved.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadYaml, analyze, formatAnalysis, ClaudeCliRuntime, CheckpointManager } from "../src/index.js";
import { createToolRegistry } from "../src/tools/index.js";

const PAPER_DIR = "/Users/landigf/Desktop/Code/Research/SpotAIfy/research/agent-traffic/paper";

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║  ClaudeFlow → Post-Revision IMC Crew                        ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`\nPaper: ${PAPER_DIR}\n`);

const p = loadYaml(path.join(import.meta.dirname, "../pipelines/imc-acceptance-crew.yaml"));

console.log("=== Analysis ===\n");
console.log(formatAnalysis(analyze(p)));
console.log("");

const runtime = new ClaudeCliRuntime({
  cwd: PAPER_DIR,
  permissionMode: "plan",
  defaultTimeoutMs: 1_200_000,
});

const tools = createToolRegistry();
const checkpoint = new CheckpointManager(path.join(import.meta.dirname, "../.claudeflow/imc-post-revision-crew/checkpoints"));

console.log("=== Running 8 Expert Agents on Revised Draft ===\n");
const startTime = Date.now();
const result = await p.run({}, { runtime, verbose: true, tools, checkpoint });
const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");

const tracePath = path.join(import.meta.dirname, `../traces/imc-post-revision-crew-${stamp}.json`);
writeFileSync(tracePath, JSON.stringify({
  ...result.trace,
  startedAt: result.trace.startedAt.toISOString(),
  finishedAt: result.trace.finishedAt.toISOString(),
}, null, 2));

const reviewPath = path.join(import.meta.dirname, `../traces/imc-post-revision-crew-${stamp}-reviews.md`);
const reviews: string[] = ["# IMC Post-Revision 8-Expert Review Crew\n"];
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

if (result.trace.status !== "completed") {
  process.exitCode = 1;
}
