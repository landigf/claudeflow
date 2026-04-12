#!/usr/bin/env npx tsx
/**
 * Audit Jarvis using ClaudeFlow.
 *
 * This runs a 4-step pipeline against the Jarvis JMCP codebase:
 * 1. Read logs for errors
 * 2. Audit source code for bugs
 * 3. Fix the most critical bug
 * 4. Verify tests pass
 *
 * Run: npx tsx examples/audit-jarvis.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  loadYaml,
  analyze,
  formatAnalysis,
  ClaudeCliRuntime,
  MemoryStore,
  CheckpointManager,
} from "../src/index.js";

const JARVIS_DIR = path.resolve(import.meta.dirname, "../../Jarvis");
const pipelinePath = path.join(import.meta.dirname, "../pipelines/audit-jarvis.yaml");

console.log("╔══════════════════════════════════════════╗");
console.log("║  ClaudeFlow → Jarvis Audit                ║");
console.log("╚══════════════════════════════════════════╝");
console.log(`\nTarget: ${JARVIS_DIR}\n`);

const p = loadYaml(pipelinePath);

// Pre-analysis
console.log("=== Pre-execution Analysis ===\n");
console.log(formatAnalysis(analyze(p)));
console.log("");

// Memory: remember previous audit results
const memory = new MemoryStore(path.join(import.meta.dirname, "../.claudeflow/memory"));

// Checkpoint: resume if interrupted
const checkpoint = new CheckpointManager(path.join(import.meta.dirname, "../.claudeflow/checkpoints"));

// Runtime: run in Jarvis directory with full permissions
const runtime = new ClaudeCliRuntime({
  cwd: JARVIS_DIR,
  permissionMode: "bypassPermissions",
  defaultTimeoutMs: 300_000,
});

console.log("=== Executing Pipeline ===\n");
const result = await p.run({}, { runtime, memory, checkpoint, verbose: true });

// Save audit results to memory for next run
if (result.output && typeof result.output === "object") {
  memory.set("jarvis-audit-latest", {
    date: new Date().toISOString(),
    output: result.output,
    status: result.trace.status,
  });
}

// Save trace
const traceName = `jarvis-audit-${new Date().toISOString().slice(0, 10)}.json`;
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

console.log("\n=== Results ===\n");
console.log(JSON.stringify(result.output, null, 2));
console.log(`\nTrace: ${tracePath}`);
console.log(`Status: ${result.trace.status}`);
console.log(`Duration: ${(result.trace.totalDurationMs / 1000).toFixed(1)}s`);
console.log(`Cost: $${result.trace.totalCostUsd.toFixed(4)}`);
