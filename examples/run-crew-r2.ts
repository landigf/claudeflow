import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadYaml, ClaudeCliRuntime, CheckpointManager } from "../src/index.js";
import { createToolRegistry } from "../src/tools/index.js";

const p = loadYaml(path.join(import.meta.dirname, "../pipelines/imc-crew-round2.yaml"));
const runtime = new ClaudeCliRuntime({
  cwd: "/Users/landigf/Desktop/Code/Research/SpotAIfy/research/agent-traffic/paper",
  permissionMode: "plan",
  defaultTimeoutMs: 1_200_000,
});
const tools = createToolRegistry();
const checkpoint = new CheckpointManager(path.join(import.meta.dirname, "../.claudeflow/imc-crew-round2/checkpoints"));

console.log("Running 4 remaining experts...");
const result = await p.run({}, { runtime, verbose: true, tools, checkpoint });

const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
const tracePath = path.join(import.meta.dirname, `../traces/imc-crew-round2-${stamp}.json`);
writeFileSync(tracePath, JSON.stringify({
  ...result.trace,
  startedAt: result.trace.startedAt.toISOString(),
  finishedAt: result.trace.finishedAt.toISOString(),
}, null, 2));

const reviewPath = path.join(import.meta.dirname, `../traces/imc-crew-round2-${stamp}-reviews.md`);
const reviews = result.trace.steps
  .filter(s => s.outputSnapshot && typeof s.outputSnapshot === "string")
  .map(s => `## ${s.stepId}\n\n${s.outputSnapshot}\n\n---\n`)
  .join("\n");
writeFileSync(reviewPath, `# IMC Crew Round 2\n\n${reviews}`);

console.log(`\nStatus: ${result.trace.status}`);
console.log(`Cost: $${result.trace.totalCostUsd.toFixed(2)}`);
console.log(`Reviews: ${reviewPath}`);

if (result.trace.status !== "completed") {
  process.exitCode = 1;
}
