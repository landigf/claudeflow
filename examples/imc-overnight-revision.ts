#!/usr/bin/env npx tsx
/**
 * Synthesize overnight IMC reviews, revise the paper in-place, rebuild the paper,
 * and save a detailed handoff report for the next validation pass.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  loadYaml,
  analyze,
  formatAnalysis,
  ClaudeCliRuntime,
  MemoryStore,
  CheckpointManager,
} from "../src/index.js";
import { createToolRegistry } from "../src/tools/index.js";

const PAPER_DIR = "/Users/landigf/Desktop/Code/Research/SpotAIfy/research/agent-traffic/paper";
const TRACE_DIR = path.join(import.meta.dirname, "../traces");
const STATE_DIR = path.join(import.meta.dirname, "../.claudeflow/imc-overnight-revision");

mkdirSync(STATE_DIR, { recursive: true });

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║  ClaudeFlow → IMC Overnight Revision                        ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`\nPaper: ${PAPER_DIR}`);
console.log(`Reviews: ${TRACE_DIR}\n`);

const p = loadYaml(path.join(import.meta.dirname, "../pipelines/imc-overnight-revision.yaml"));

console.log("=== Analysis ===\n");
console.log(formatAnalysis(analyze(p)));
console.log("");

const runtime = new ClaudeCliRuntime({
  cwd: PAPER_DIR,
  permissionMode: "bypassPermissions",
  defaultTimeoutMs: 1_200_000,
});

const tools = createToolRegistry();
const memory = new MemoryStore(path.join(STATE_DIR, "memory"));
const checkpoint = new CheckpointManager(path.join(STATE_DIR, "checkpoints"));

console.log("=== Revising Paper Overnight ===\n");
const result = await p.run(
  {
    paper_dir: PAPER_DIR,
    trace_dir: TRACE_DIR,
    today: new Date().toISOString().slice(0, 10),
  },
  { runtime, verbose: true, tools, memory, checkpoint },
);

const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
const tracePath = path.join(import.meta.dirname, `../traces/imc-overnight-revision-${stamp}.json`);
writeFileSync(tracePath, JSON.stringify({
  ...result.trace,
  startedAt: result.trace.startedAt.toISOString(),
  finishedAt: result.trace.finishedAt.toISOString(),
}, null, 2));

const summaryPath = path.join(import.meta.dirname, `../traces/imc-overnight-revision-${stamp}-summary.md`);
const sections = result.trace.steps.map((step) => {
  const body = typeof step.outputSnapshot === "string"
    ? step.outputSnapshot
    : `\`\`\`json\n${JSON.stringify(step.outputSnapshot, null, 2)}\n\`\`\``;
  return `## ${step.stepId}\n\n${body}`;
}).join("\n\n---\n\n");
writeFileSync(
  summaryPath,
  `# IMC Overnight Revision\n\nPaper: ${PAPER_DIR}\n\nTrace: ${tracePath}\n\n${sections}\n`,
);

console.log(`\nStatus: ${result.trace.status}`);
console.log(`Cost: $${result.trace.totalCostUsd.toFixed(2)}`);
console.log(`Trace: ${tracePath}`);
console.log(`Summary: ${summaryPath}`);

if (result.trace.status !== "completed") {
  process.exitCode = 1;
}
