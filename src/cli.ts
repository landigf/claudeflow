#!/usr/bin/env node
/**
 * ClaudeFlow CLI — run, analyze, and validate pipelines from the terminal.
 *
 * Usage:
 *   npx claudeflow run pipeline.yaml [--input '{"key": "value"}'] [--verbose]
 *   npx claudeflow analyze pipeline.yaml
 *   npx claudeflow validate pipeline.yaml
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { analyze, formatAnalysis } from "./analyzer/index.js";
import { loadYaml } from "./loader/yaml.js";
import { CheckpointManager } from "./memory/checkpoint.js";
import { MemoryStore } from "./memory/store.js";
import { type RuntimeProvider, createRuntime } from "./runtime/factory.js";
import {
  doctorTeamKit,
  formatDoctorReport,
  initTeamKit,
  parseAssistantList,
  parseTeamKitPreset,
} from "./teamkit/index.js";
import { validate } from "./testing/validate.js";
import { createToolRegistry } from "./tools/index.js";

const args = process.argv.slice(2);
const command = args[0];
if (!command) {
  console.log("ClaudeFlow — Composable AI task pipelines\n");
  console.log("Usage:");
  console.log("  claudeflow run <pipeline.yaml> [options]");
  console.log("  claudeflow analyze <pipeline.yaml>");
  console.log("  claudeflow validate <pipeline.yaml>");
  console.log("  claudeflow init [--preset hackathon|startup] [--assistants claude,codex,copilot]");
  console.log("  claudeflow doctor [--cwd <dir>]\n");
  console.log("Options:");
  console.log("  --input '{...}'    Pipeline input as JSON");
  console.log("  --verbose          Show step-by-step progress");
  console.log("  --preset <name>    Team Kit preset for `init`");
  console.log("  --assistants <xs>  Assistant surfaces for `init`");
  console.log("  --force            Overwrite managed Team Kit files");
  console.log("  --cwd <dir>        Working directory for Claude CLI");
  console.log(
    "  --runtime <name>   claude-cli | anthropic | openai | gemini | openai-compatible | ollama",
  );
  console.log("  --model <id>       Default model for API runtimes");
  console.log("  --base-url <url>   Custom base URL for API runtimes");
  console.log("  --max-tokens <n>   Max output tokens for API runtimes");
  console.log("  --permission <m>   Permission mode (plan|bypassPermissions)");
  console.log("  --max-turns <n>    Max turns per Claude invocation");
  console.log("");
  console.log("Env vars:");
  console.log("  ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY");
  console.log("  OPENAI_COMPATIBLE_BASE_URL, OPENAI_COMPATIBLE_API_KEY");
  console.log("  GEMINI_BASE_URL, GEMINI_MODEL");
  console.log("  OLLAMA_BASE_URL, OLLAMA_MODEL");
  process.exit(1);
}

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function requirePipelinePath(): string {
  const pipelinePath = args[1];
  if (!pipelinePath) {
    console.error(`Command "${command}" requires a pipeline path.`);
    process.exit(1);
  }
  if (!existsSync(pipelinePath)) {
    console.error(`File not found: ${pipelinePath}`);
    process.exit(1);
  }
  return pipelinePath;
}

switch (command) {
  case "init": {
    const cwd = getArg("--cwd") ?? process.cwd();
    const preset = parseTeamKitPreset(getArg("--preset"));
    const assistants = parseAssistantList(getArg("--assistants"));
    const force = args.includes("--force");

    const result = initTeamKit(cwd, { preset, assistants, force });
    console.log(`Initialized ClaudeFlow Team Kit in ${result.rootDir}`);
    console.log(`Preset: ${preset}`);
    console.log(`Assistants: ${assistants.join(", ")}`);
    console.log(`Config: ${result.configPath}`);
    console.log("");
    console.log(`Created: ${result.created.length}`);
    console.log(`Updated: ${result.updated.length}`);
    console.log(`Skipped: ${result.skipped.length}`);
    break;
  }

  case "doctor": {
    const cwd = getArg("--cwd") ?? process.cwd();
    const report = doctorTeamKit(cwd);
    console.log(formatDoctorReport(report));
    if (!report.ok) process.exit(1);
    break;
  }

  case "analyze": {
    const pipelinePath = requirePipelinePath();
    const p = loadYaml(pipelinePath);
    console.log(formatAnalysis(analyze(p)));
    break;
  }

  case "validate": {
    const pipelinePath = requirePipelinePath();
    const p = loadYaml(pipelinePath);
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
    const pipelinePath = requirePipelinePath();
    const p = loadYaml(pipelinePath);
    const inputStr = getArg("--input");
    const input = inputStr ? JSON.parse(inputStr) : {};
    const verbose = args.includes("--verbose");
    const cwd = getArg("--cwd") ?? process.cwd();
    const runtimeProvider = getArg("--runtime") as RuntimeProvider | undefined;
    const model = getArg("--model");
    const baseUrl = getArg("--base-url");
    const maxTokens = getArg("--max-tokens");
    const permission = (getArg("--permission") ?? "plan") as "plan" | "bypassPermissions";
    const maxTurns = getArg("--max-turns");

    const runtime = createRuntime({
      provider: runtimeProvider,
      model,
      baseUrl,
      maxTokens: maxTokens ? Number(maxTokens) : undefined,
      cwd,
      permissionMode: permission,
      defaultTimeoutMs: 300_000,
      maxTurns: maxTurns ? Number(maxTurns) : undefined,
    });

    const tracesDir = path.join(path.dirname(pipelinePath), "..", "traces");
    if (!existsSync(tracesDir)) mkdirSync(tracesDir, { recursive: true });

    const memory = new MemoryStore(
      path.join(path.dirname(pipelinePath), "..", ".claudeflow", "memory"),
    );
    const checkpoint = new CheckpointManager(
      path.join(path.dirname(pipelinePath), "..", ".claudeflow", "checkpoints"),
    );
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
        {
          ...result.trace,
          startedAt: result.trace.startedAt.toISOString(),
          finishedAt: result.trace.finishedAt.toISOString(),
        },
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
    console.error(`Unknown command: ${command}. Use: run, analyze, validate, init, doctor`);
    process.exit(1);
}
