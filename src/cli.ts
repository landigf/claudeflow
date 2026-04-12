#!/usr/bin/env node
/**
 * ClaudeFlow CLI — run, analyze, and validate pipelines from the terminal.
 *
 * Usage:
 *   npx claudeflow run pipeline.yaml [--input '{"key": "value"}'] [--verbose]
 *   npx claudeflow analyze pipeline.yaml
 *   npx claudeflow validate pipeline.yaml
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadYaml } from "./loader/yaml.js";
import { analyze, formatAnalysis } from "./analyzer/index.js";
import { validate } from "./testing/validate.js";
import { ClaudeCliRuntime } from "./runtime/cli.js";
import { MemoryStore } from "./memory/store.js";
import { CheckpointManager } from "./memory/checkpoint.js";
import { createToolRegistry } from "./tools/index.js";

const args = process.argv.slice(2);
const command = args[0];
const pipelinePath = args[1];

if (!command || !pipelinePath) {
  console.log("ClaudeFlow — Composable AI task pipelines\n");
  console.log("Usage:");
  console.log("  claudeflow run <pipeline.yaml> [options]");
  console.log("  claudeflow analyze <pipeline.yaml>");
  console.log("  claudeflow validate <pipeline.yaml>\n");
  console.log("Options:");
  console.log("  --input '{...}'    Pipeline input as JSON");
  console.log("  --verbose          Show step-by-step progress");
  console.log("  --cwd <dir>        Working directory for Claude");
  console.log("  --permission <m>   Permission mode (plan|bypassPermissions)");
  console.log("  --max-turns <n>    Max turns per Claude invocation");
  process.exit(1);
}

if (!existsSync(pipelinePath)) {
  console.error(`File not found: ${pipelinePath}`);
  process.exit(1);
}

const p = loadYaml(pipelinePath);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

switch (command) {
  case "analyze": {
    console.log(formatAnalysis(analyze(p)));
    break;
  }

  case "validate": {
    const errors = validate(p);
    if (errors.length === 0) {
      console.log("✓ Pipeline is valid — no issues found.");
    } else {
      const errCount = errors.filter((e) => e.severity === "error").length;
      const warnCount = errors.filter((e) => e.severity === "warning").length;
      for (const e of errors) {
        const icon = e.severity === "error" ? "✗" : "⚠";
        console.log(`${icon} [${e.stepId}] ${e.message}`);
      }
      console.log(`\n${errCount} error(s), ${warnCount} warning(s)`);
      if (errCount > 0) process.exit(1);
    }
    break;
  }

  case "run": {
    const inputStr = getArg("--input");
    const input = inputStr ? JSON.parse(inputStr) : {};
    const verbose = args.includes("--verbose");
    const cwd = getArg("--cwd") ?? process.cwd();
    const permission = (getArg("--permission") ?? "plan") as "plan" | "bypassPermissions";
    const maxTurns = getArg("--max-turns");

    const runtime = new ClaudeCliRuntime({
      cwd,
      permissionMode: permission,
      defaultTimeoutMs: 300_000,
      maxTurns: maxTurns ? Number(maxTurns) : undefined,
    });

    const tracesDir = path.join(path.dirname(pipelinePath), "..", "traces");
    if (!existsSync(tracesDir)) mkdirSync(tracesDir, { recursive: true });

    const memory = new MemoryStore(path.join(path.dirname(pipelinePath), "..", ".claudeflow", "memory"));
    const checkpoint = new CheckpointManager(path.join(path.dirname(pipelinePath), "..", ".claudeflow", "checkpoints"));
    const tools = createToolRegistry();

    // Pre-analysis
    if (verbose) {
      console.log("=== Pre-execution Analysis ===\n");
      console.log(formatAnalysis(analyze(p)));
      console.log("");
      console.log("=== Executing Pipeline ===\n");
    }

    const result = await p.run(input, { runtime, verbose, memory, checkpoint, tools });

    // Save trace
    const traceName = `${p.name}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
    const tracePath = path.join(tracesDir, traceName);
    writeFileSync(
      tracePath,
      JSON.stringify(
        { ...result.trace, startedAt: result.trace.startedAt.toISOString(), finishedAt: result.trace.finishedAt.toISOString() },
        null,
        2,
      ),
    );

    if (verbose) {
      console.log(`\nTrace saved: ${tracePath}`);
    }

    console.log(`\nStatus: ${result.trace.status}`);
    console.log(`Duration: ${(result.trace.totalDurationMs / 1000).toFixed(1)}s`);
    console.log(`Cost: $${result.trace.totalCostUsd.toFixed(4)}`);

    if (result.trace.status === "failed") process.exit(1);
    break;
  }

  default:
    console.error(`Unknown command: ${command}. Use: run, analyze, validate`);
    process.exit(1);
}
