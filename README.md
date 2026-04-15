# ClaudeFlow

**Composable AI task pipelines — Zod for LLM workflows.**

Define steps with typed schemas. Compose with loops, branches, maps. Inspect prompt footprint and risk before running. Get full execution traces. Same pipeline runs on Claude CLI, Anthropic API, OpenAI-compatible APIs, or local Ollama models.

```
npm install claudeflow
```

## Quick start

```typescript
import { step, pipeline, z, ClaudeCliRuntime } from "claudeflow";

const summarize = step("summarize")
  .input(z.object({ url: z.string() }))
  .output(z.object({ title: z.string(), summary: z.string() }))
  .prompt("Summarize this URL: {url}")
  .retry({ maxAttempts: 2 });

const classify = step("classify")
  .output(z.object({ category: z.string(), confidence: z.number() }))
  .prompt("Classify: {summarize.summary}");

const result = await pipeline("digest")
  .step(summarize)
  .step(classify)
  .run({ url: "https://example.com" }, {
    runtime: new ClaudeCliRuntime(),
    verbose: true,
  });
```

Output:
```
[claudeflow] digest
[claudeflow] Runtime: ClaudeCliRuntime

[1/2] summarize ✓ 3200ms  847 tokens
[2/2] classify  ✓ 1400ms  210 tokens

[claudeflow] ✓ completed in 4602ms
[claudeflow] Tokens: 412 in / 645 out
[claudeflow] Cost: $0.0118
```

## Why

When you ask Claude to do a complex multi-step task, it fails. No persistent state, no control flow, no validation, no observability. The conversation disappears when you're done.

**ClaudeFlow replaces throwaway chats with reusable pipeline files:**

- **Composable** — steps, loops, branches, maps
- **Typed** — Zod schemas validate every step boundary
- **Analyzable** — inspect prompt footprint, pricing scenarios, and runtime risk before running
- **Observable** — full trace with timing, tokens, cost per step
- **Testable** — MockRuntime for zero-token development, validate() for static checks
- **Portable** — same pipeline runs on Claude CLI, API keys, or local OpenAI-compatible servers
- **Shareable** — YAML files checked into git, reviewed in PRs

## Core concepts

5 primitives:

| Primitive | What it does |
|-----------|-------------|
| `step()` | One LLM call with typed input/output |
| `pipeline()` | Ordered composition of steps |
| `loop()` | Repeat until condition met |
| `branch()` | Route based on predicate |
| `map()` | Run step over each item in array |

## YAML pipelines

Define pipelines as shareable config files:

```yaml
name: investigate-bug
steps:
  - id: parse-error
    prompt: "Parse this error: {error_log}"
    output: { module: string, error_type: string }
  - id: diagnose
    prompt: "Find root cause in {parse-error.module}"
    output: { root_cause: string, fix: string }
    retry: { maxAttempts: 3 }
```

```typescript
import { loadYaml, ClaudeCliRuntime } from "claudeflow";
const result = await loadYaml("investigate-bug.yaml").run(
  { error_log: "..." },
  { runtime: new ClaudeCliRuntime() }
);
```

## Built-in tools

ClaudeFlow ships with deterministic adapters you can call from YAML or TypeScript tool nodes:

- `file` — read, write, list files
- `shell` — run local commands
- `github` — search issues and GitHub metadata through `gh`
- `eval` — run a command and extract a metric
- `promptfoo` and `dspy` — evaluation / prompt tooling
- `web` — search the web, fetch source pages, and return links plus extracted text

Example web research step:

```yaml
- id: gather-sources
  tool: web
  action: research
  params:
    query: "{topic}"
    topK: 6
    fetchTopK: 4
```

The built-in `web` tool returns source links in `links` and fetched source material in `sources`, so later steps can cite what they used instead of inventing URLs.

## Team Kit

ClaudeFlow can also scaffold a repo-native collaboration kit for teammates using Claude, Codex, and Copilot.

```bash
npx claudeflow init --preset hackathon --assistants claude,codex,copilot
npx claudeflow doctor
```

Re-run `init` with another preset to add more scaffolded use cases. Presets merge into the Team Kit config, so you can enable both hackathon and startup assets in the same repo.

What `init` adds:
- `AGENTS.md` guidance for cross-assistant quality and lifecycle rules
- `.github/copilot-instructions.md` for Copilot-aware repo behavior
- `.claude/commands/` slash-command workflows for Claude Code
- `doc/specs/<slug>/` lifecycle templates: brainstorm -> spec -> tasks -> implementation -> feedback
- `explainit/` human-readable playbooks for hackathon and startup usage
- `explainit/macbook-m3-pro.md` for Apple Silicon local-model guidance
- `explainit/gdg-ai-hack-2026/` for the researched Milan hackathon challenge pack
- starter pipelines in `pipelines/hackathon/` or `pipelines/startup/`

The default teammate flow is:
1. brainstorm in `01-brainstorm.md`
2. turn it into `02-specification.md`
3. break it into `03-tasks.md`
4. write `04-implementation.md` as the handoff
5. append findings to `05-feedback.md`

`doctor` checks that the Team Kit assets exist, validates runtime profile defaults, and warns about missing env vars or tools like `claude` and `ollama`.

## Inspect before running

Use the static planner to inspect structure and rough pricing scenarios before spending tokens:

```typescript
import { analyze, formatAnalysis } from "claudeflow";
console.log(formatAnalysis(analyze(myPipeline)));
```

```
Pipeline: digest
Steps: 2 (2 LLM, 0 deterministic)

Prompt footprint heuristic:
  Input:  ~620 (496-930)
  Output: ~90 (45-180)

Pricing scenarios (heuristic):
  configured/default pricing: $0.0033 baseline, $0.0033 retry upper bound
  if unpinned steps use claude-haiku-4-5: $0.0009 baseline, $0.0009 retry upper bound

Warnings:
  - Step "classify" has no retry config - one failed LLM call ends that step
```

Treat this as planning guidance, not telemetry. `analyze()` does not know your runtime inputs,
tool outputs, map cardinality, loop exit conditions, or upstream provider behavior.

## Long-Running Tasks

ClaudeFlow can orchestrate long jobs, but it cannot make Claude Code run forever.

- `defaultTimeoutMs` is ClaudeFlow's wrapper timeout for one step, not a guarantee that the CLI or provider will allow unlimited runtime.
- Claude Code/Max jobs can still stop because of usage resets, capacity, or backend limits.
- For long jobs, prefer smaller steps plus checkpoints over one giant reviewer/editor step.
- If a step regularly pushes the timeout ceiling, split it instead of just increasing the timeout again.
- Use retries for transient failures and checkpoints for expensive multi-step work.

Recommended pattern for long jobs:

```typescript
import { loadYaml, ClaudeCliRuntime, CheckpointManager } from "claudeflow";

const pipeline = loadYaml("pipelines/overnight-review.yaml");
const runtime = new ClaudeCliRuntime({
  cwd: "/path/to/project",
  permissionMode: "plan",
  defaultTimeoutMs: 1_200_000, // generous wrapper timeout, not "infinite"
});
const checkpoint = new CheckpointManager(".claudeflow/checkpoints");

await pipeline.run({}, { runtime, checkpoint, verbose: true });
```

Rule of thumb:
- use `analyze()` to spot risky structure before execution
- use `retry` for flaky steps
- use `checkpoint` for expensive pipelines
- split the step if one prompt is doing too much

## Runtime Choices

Keep Claude Max as the default when you want Claude Code tools and subscription-based local runs:

```typescript
import { ClaudeCliRuntime } from "claudeflow";

const runtime = new ClaudeCliRuntime({ permissionMode: "plan" });
```

Use API keys when you want predictable daily automation spend:

```typescript
import { ClaudeApiRuntime, OpenAICompatibleRuntime } from "claudeflow";

const anthropic = new ClaudeApiRuntime({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: "claude-haiku-4-5-20251001",
});

const openai = new OpenAICompatibleRuntime({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-5-mini",
});

const gemini = new OpenAICompatibleRuntime({
  apiKey: process.env.GEMINI_API_KEY!,
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  model: "gemini-2.5-flash-lite",
});

const ollama = new OpenAICompatibleRuntime({
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "auto",
});
```

Or use the dedicated Ollama wrapper:

```typescript
import { OllamaRuntime } from "claudeflow";

const runtime = new OllamaRuntime({
  model: "auto",
});
```

`OllamaRuntime({ model: "auto" })` routes locally by use case:
- lightweight text work -> `qwen2.5-coder:3b`
- coding/review work -> `qwen2.5-coder:7b`
- vision-like prompts -> `gemma3:4b`

The CLI can switch providers without changing pipeline files:

```bash
# Claude Max / Claude Code
npx claudeflow run pipelines/daily.yaml --runtime claude-cli

# Anthropic API
ANTHROPIC_API_KEY=... npx claudeflow run pipelines/daily.yaml --runtime anthropic --model claude-haiku-4-5-20251001

# OpenAI API
OPENAI_API_KEY=... npx claudeflow run pipelines/daily.yaml --runtime openai --model gpt-5-mini

# Gemini API via the official OpenAI-compatible endpoint
GEMINI_API_KEY=... npx claudeflow run pipelines/daily.yaml --runtime gemini --model gemini-2.5-flash-lite

# Local Ollama with automatic model selection
npx claudeflow run pipelines/daily.yaml --runtime ollama
```

Practical default split:
- cheapest recurring classification/extraction/rewrite steps: `gpt-5-nano`, `gpt-4o-mini`, or local Ollama
- hackathon/sponsor-friendly cheap path: `gemini-2.5-flash-lite`
- best cost/quality daily default: `gpt-5-mini` or `claude-haiku`
- deeper synthesis / complex code audits: `gpt-5.4-mini`, Claude CLI / Sonnet / Opus
- privacy-sensitive or near-zero marginal cost batch work: Ollama/local model

## Testing without tokens

```typescript
import { MockRuntime, validate, benchmark } from "claudeflow";

// Static validation — no execution
const errors = validate(myPipeline);

// Mock runtime — deterministic, instant
const mock = new MockRuntime({
  summarize: { title: "Test", summary: "AI pipelines" },
  classify: { category: "tech", confidence: 0.95 },
});
const result = await myPipeline.run(input, { runtime: mock });

// Benchmark — run N times, get statistics
const stats = await benchmark(myPipeline, input, { runtime: mock, runs: 50 });
// → { successRate: 1.0, duration: { p50Ms: 2, p95Ms: 3 }, ... }
```

## Self-hosting

ClaudeFlow is built using ClaudeFlow. The self-audit pipeline (`pipelines/self-audit.yaml`) found 3 improvements in its own codebase, which were then applied (PR #14). Execution traces are stored in `traces/` as proof.

```
traces/self-audit-2026-04-12.json
  Status: completed
  Duration: 120.9s
  Tokens: 1,681 in / 4,253 out
  Cost: $0.48
  Steps: 3/3 completed
```

## Architecture

```
src/core/       → Step, Pipeline, Context, Schema
src/control/    → Loop, Branch, Map + shared resolve helper
src/runtime/    → ClaudeCliRuntime, ClaudeApiRuntime, OpenAICompatibleRuntime, MockRuntime
src/analyzer/   → Static planning heuristics
src/loader/     → YAML parser, prompt interpolation
src/testing/    → validate(), benchmark()
```

## Documentation

- **[Cookbook](docs/COOKBOOK.md)** — 17 practical recipes: code review, bug fixing, overnight optimization, multi-agent crews, paper review, checkpointing, and more
- **[Pipeline Ideas](docs/PIPELINE_IDEAS.md)** — 20+ real-world pipeline templates for every use case
- **[Benchmark](docs/BENCHMARK.md)** — ClaudeFlow vs raw Claude CLI comparison with real data
- **[CLAUDE.md](CLAUDE.md)** — Instructions for AI agents working on this codebase
- **[AGENTS.md](AGENTS.md)** — Universal agent instructions (works with Cursor, Copilot, etc.)

## License

MIT

<!-- claudeflow-teamkit-readme:start -->
## ClaudeFlow Team Kit

This repository is prepared to work with ClaudeFlow as a structured collaboration layer for humans plus assistants.

Start here:
1. Read `AGENTS.md`.
2. Read `explainit/README.md` and the relevant use-case file.
3. Use `doc/specs/<slug>/` for idea -> spec -> tasks -> implementation -> feedback.

Recommended runtime path:
- `cheap`: openai / gpt-5-mini
- `deep`: claude-cli / claude-sonnet-4-20250514
- `local`: ollama / auto

Teammates should start with `cheap` unless the task clearly needs deeper reasoning or a private local run.

Hackathon operating mode:
- Use local Ollama aggressively for bulk drafting, review loops, summaries, rewrites, and intermediate code passes.
- Use Gemini as the main hosted path for most structured requests.
- Use OpenAI only when you want important research or a serious second opinion.
- Use Claude for interactive coding, final review, and final verification runs.
<!-- claudeflow-teamkit-readme:end -->
