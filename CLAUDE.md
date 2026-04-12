# CLAUDE.md — ClaudeFlow

## What this is

ClaudeFlow is a TypeScript library for composable AI task pipelines. Define steps with Zod schemas, compose them with loops/branches/maps, run them on Claude CLI or API, get full traces.

## After every change

```bash
npm run test && npm run check
```

## Architecture

```
src/core/       → Step, Pipeline, Context, Schema (the 4 primitives)
src/control/    → Loop, Branch, Map (control flow — wired into pipeline executor)
src/runtime/    → Runtime interface + implementations (CLI, Mock)
src/observability/ → Trace types
src/loader/     → Prompt interpolation
```

Dependencies flow forward: Core → Control → Runtime → Observability.
Never import backward (e.g., runtime must not import from control).

## Code style

- Biome for formatting: `npm run format`
- TypeScript strict mode
- No classes unless they need private state — prefer functions and interfaces
- Zod for all schemas — re-export from `src/core/schema.ts`
- Immutable data — Context is frozen, StepBuilder returns new instances

## What exists vs what's planned

**Working now:** step, pipeline, loop, branch, map, MockRuntime, ClaudeCliRuntime, prompt interpolation, traces
**Not yet built:** YAML loader, analyzer (token/cost prediction), ClaudeApiRuntime, benchmark harness
