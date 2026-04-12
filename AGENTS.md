# AGENTS.md — ClaudeFlow

This file is a map, not an encyclopedia. Read it first, then drill into the files it points to.

## Quick start

```bash
npm install
npm run test        # vitest
npm run check       # tsc --noEmit
npm run format      # biome
```

## What this project does

ClaudeFlow lets you define AI task pipelines as code (TypeScript) or config (YAML). Each pipeline is a sequence of steps with typed inputs/outputs, retry logic, and full execution traces. Same pipeline runs on Claude CLI (free) or Claude API (production).

## Key files

- `src/index.ts` — public API exports
- `src/core/step.ts` — Step builder (the atomic unit)
- `src/core/pipeline.ts` — Pipeline execution engine
- `src/core/context.ts` — Immutable state flowing between steps
- `src/runtime/types.ts` — Runtime interface (CLI/API/Mock)
- `src/loader/interpolation.ts` — Prompt template `{variable}` expansion
- `test/core/pipeline.test.ts` — Core tests (start here to understand behavior)

## Rules

1. Run `npm run test && npm run check` after every change
2. Never import backward through the layer chain (Core → Control → Runtime → Testing)
3. Keep steps immutable — builders return new instances
4. Every step must have an `id` — it's used to key outputs in context
5. Zod schemas are the only way to define step contracts
