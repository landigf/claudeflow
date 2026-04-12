/**
 * Self-hosting demo: ClaudeFlow audits itself.
 *
 * This script:
 * 1. Loads the self-audit pipeline from YAML
 * 2. Analyzes it (predicts cost/time before running)
 * 3. Runs it with ClaudeCliRuntime
 * 4. Saves the trace to traces/ as proof
 *
 * Run: npx tsx examples/self-audit.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadYaml, analyze, formatAnalysis, ClaudeCliRuntime } from "../src/index.js";

const pipelinePath = path.join(import.meta.dirname, "../pipelines/self-audit.yaml");
const p = loadYaml(pipelinePath);

// Step 1: Analyze before running (the "compiler")
console.log("=== Pre-execution Analysis ===\n");
const analysis = analyze(p);
console.log(formatAnalysis(analysis));
console.log("");

// Step 2: Run the pipeline
console.log("=== Running Pipeline ===\n");
const runtime = new ClaudeCliRuntime({
  cwd: path.join(import.meta.dirname, ".."),
  permissionMode: "plan", // read-only — can read files but not edit
});

const result = await p.run({}, { runtime, verbose: true });

// Step 3: Save the trace as proof
const tracePath = path.join(
  import.meta.dirname,
  "../traces",
  `self-audit-${new Date().toISOString().slice(0, 10)}.json`,
);
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
console.log(`\nTrace saved to: ${tracePath}`);

// Step 4: Show the output
console.log("\n=== Audit Results ===\n");
console.log(JSON.stringify(result.output, null, 2));
