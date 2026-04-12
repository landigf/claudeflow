#!/usr/bin/env npx tsx
/**
 * Universal pipeline runner — run any YAML pipeline from the command line.
 *
 * Usage:
 *   npx tsx examples/run-pipeline.ts improve-self
 *   npx tsx examples/run-pipeline.ts check-docs
 *   npx tsx examples/run-pipeline.ts self-audit
 *   npx tsx examples/run-pipeline.ts /path/to/custom-pipeline.yaml
 */
import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadYaml, analyze, formatAnalysis, ClaudeCliRuntime } from "../src/index.js";

const pipelineName = process.argv[2];
if (!pipelineName) {
  console.error("Usage: npx tsx examples/run-pipeline.ts <pipeline-name|path>");
  console.error("");
  console.error("Available pipelines:");
  console.error("  improve-self   — Find and implement improvements in ClaudeFlow");
  console.error("  check-docs     — Verify documentation matches code");
  console.error("  self-audit     — Quality audit of the codebase");
  process.exit(1);
}

// Resolve pipeline path
let pipelinePath: string;
if (existsSync(pipelineName)) {
  pipelinePath = pipelineName;
} else {
  pipelinePath = path.join(import.meta.dirname, "../pipelines", `${pipelineName}.yaml`);
  if (!existsSync(pipelinePath)) {
    console.error(`Pipeline not found: ${pipelineName}`);
    console.error(`Looked in: ${pipelinePath}`);
    process.exit(1);
  }
}

const p = loadYaml(pipelinePath);

// Step 1: Analyze
console.log("╔══════════════════════════════════════════╗");
console.log("║  ClaudeFlow Pipeline Runner              ║");
console.log("╚══════════════════════════════════════════╝");
console.log("");
console.log("=== Pre-execution Analysis ===\n");
const analysis = analyze(p);
console.log(formatAnalysis(analysis));
console.log("");

// Step 2: Run
console.log("=== Executing Pipeline ===\n");
const runtime = new ClaudeCliRuntime({
  cwd: path.join(import.meta.dirname, ".."),
  permissionMode: pipelineName.includes("improve") ? "bypassPermissions" : "plan",
  defaultTimeoutMs: 300_000,
});

// Register tool adapters
const { createToolRegistry } = await import("../src/tools/index.js");
const tools = createToolRegistry();

const result = await p.run({}, { runtime, verbose: true, tools });

// Step 3: Save trace
const traceName = `${p.name}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
const tracePath = path.join(import.meta.dirname, "../traces", traceName);
writeFileSync(
  tracePath,
  JSON.stringify(
    {
      ...result.trace,
      startedAt: result.trace.startedAt.toISOString(),
      finishedAt: result.trace.finishedAt.toISOString(),
    },
    null,
    2,
  ),
);

// Step 4: Summary
console.log("\n=== Results ===\n");
console.log(JSON.stringify(result.output, null, 2));
console.log(`\nTrace saved: ${tracePath}`);
console.log(`Status: ${result.trace.status}`);
console.log(`Duration: ${(result.trace.totalDurationMs / 1000).toFixed(1)}s`);
console.log(`Cost: $${result.trace.totalCostUsd.toFixed(4)}`);
