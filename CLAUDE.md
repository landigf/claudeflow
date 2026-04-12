# CLAUDE.md — ClaudeFlow

## What this is

ClaudeFlow is a TypeScript library for composable AI task pipelines. Define steps with Zod schemas, compose them with loops/branches/maps, run them on Claude CLI or API, get full traces.

## After every change

```bash
npm run test && npm run check
```

## Architecture

```
src/core/          → Step, Pipeline, Context, Schema
src/control/       → Loop, Branch, Map (wired into pipeline executor)
src/runtime/       → Runtime interface, ClaudeCliRuntime, MockRuntime
src/analyzer/      → Pre-execution analysis (token/cost/time prediction)
src/observability/ → Trace types
src/loader/        → YAML parser, prompt interpolation
```

Dependencies flow forward: Core → Control → Runtime → Analyzer → Observability.

## What works

- `step()` builder with fluent API, Zod schemas, retry, fallback
- `pipeline()` executor with step, loop, branch, map nodes
- `MockRuntime` for zero-token testing
- `ClaudeCliRuntime` — spawns `claude -p` CLI
- `loadYaml()` / `parseYamlString()` — YAML pipeline definitions
- `analyze()` / `formatAnalysis()` — predict tokens, cost, time before running
- Prompt interpolation with `{variable}` and `{step.field}` syntax
- Full `PipelineTrace` with per-step timing, tokens, cost

## What's not built yet

- `ClaudeApiRuntime` (Anthropic SDK)
- Benchmark harness
- Snapshot test recording/replay
- CLI binary (`npx claudeflow run pipeline.yaml`)

## Code style

- Biome for formatting
- TypeScript strict mode
- Immutable data — Context is frozen, builders return new instances
- Zod for all schemas
