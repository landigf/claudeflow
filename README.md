# ClaudeFlow

**Composable AI task pipelines — Zod for LLM workflows.**

Define steps with typed schemas. Compose with loops, branches, maps. Run on Claude CLI (free) or API (production). Get full execution traces with timing, tokens, and cost.

```
npm install claudeflow
```

## Quick start

```typescript
import { step, pipeline, z, ClaudeCliRuntime } from "claudeflow";

const summarize = step("summarize")
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

console.log(result.output);     // { category: "tech", confidence: 0.92 }
console.log(result.trace);      // full execution trace
```

## Why

When you give Claude a complex multi-step task, it fails. No persistent state between steps, no control flow, no contracts, no observability. You can't share a pipeline with a colleague, swap the model, or know how long it'll take.

**ClaudeFlow fixes this.** Pipeline files replace throwaway chats:

- **Composable** — steps, loops, branches, maps, sub-pipelines
- **Typed** — Zod schemas validate every step boundary
- **Observable** — every run produces timing, tokens, cost per step
- **Testable** — MockRuntime for zero-token development
- **Portable** — same pipeline runs on CLI (free) or API (production)
- **Shareable** — checked into git, reviewed in PRs, versioned

## Core concepts

**5 primitives, that's it:**

| Primitive | What it does |
|-----------|-------------|
| `step()` | One LLM call with typed input/output |
| `pipeline()` | Ordered composition of steps |
| `loop()` | Repeat until condition met |
| `branch()` | Route based on predicate |
| `map()` | Run step over each item in array |

## Testing without tokens

```typescript
import { MockRuntime } from "claudeflow/testing";

const mock = new MockRuntime({
  summarize: { title: "Test", summary: "A test article" },
  classify: { category: "tech", confidence: 0.95 },
});

const result = await myPipeline.run(input, { runtime: mock });
expect(result.output.category).toBe("tech");
```

## Self-hosting

ClaudeFlow is built using ClaudeFlow. Pipeline definitions and execution traces are stored in `pipelines/` and `traces/` — proving the tool works on real tasks.

## Architecture

```
src/core/       → Step, Pipeline, Context, Schema
src/control/    → Loop, Branch, Map
src/runtime/    → ClaudeCliRuntime, ClaudeApiRuntime, MockRuntime
src/observability/ → PipelineTrace, StepTrace
src/analyzer/   → Pre-execution token/cost/time prediction
```

## License

MIT
