# ClaudeFlow

**Composable AI task pipelines — Zod for LLM workflows.**

Define steps with typed schemas. Compose with loops, branches, maps. Inspect prompt footprint and risk before running. Get full execution traces. Same pipeline runs on Claude CLI (free) or API (production).

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
- **Portable** — same pipeline runs on CLI (free) or API (production)
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
src/runtime/    → ClaudeCliRuntime, ClaudeApiRuntime, MockRuntime
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
