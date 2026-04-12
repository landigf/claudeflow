# CLAUDE.md — ClaudeFlow

## What this is

ClaudeFlow is a TypeScript library for composable AI task pipelines. Define steps with Zod schemas, compose with loops/branches/maps/optimize, run on Claude CLI or API, get full traces. Tool adapters enable deterministic steps (shell, file, GitHub, eval) without LLM calls.

## After every change

```bash
npm run test && npm run check
```

## CLI

```bash
npx claudeflow run pipeline.yaml --verbose
npx claudeflow analyze pipeline.yaml
npx claudeflow validate pipeline.yaml
```

## Architecture

```
src/core/          → Step, Pipeline, Context, Schema (6 node types)
src/control/       → Loop, Branch, Map, Optimize (autoresearch pattern)
src/runtime/       → ClaudeCliRuntime, ClaudeApiRuntime, MockRuntime
src/tools/         → ShellTool, GitHubTool, FileTool, EvalTool (deterministic)
src/memory/        → MemoryStore (file-based KV), CheckpointManager (resume)
src/analyzer/      → Token/cost/time prediction
src/loader/        → YAML parser (steps, tools, control flow, optimize)
src/testing/       → validate(), benchmark()
src/cli.ts         → CLI binary entry point
```

## Pipeline node types

1. `step` — LLM call with typed I/O, retry, fallback
2. `loop` — repeat until condition
3. `branch` — conditional routing
4. `map` — run step over array items (concurrent)
5. `tool` — deterministic tool adapter call (no LLM, no tokens)
6. `optimize` — autoresearch loop: mutate → eval → keep/discard → repeat

## Code style

- Biome for formatting
- TypeScript strict mode
- Immutable data — Context is frozen, builders return new instances
- Zod for all schemas
- ESM only — no require(), use imports
