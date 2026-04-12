# Benchmark: ClaudeFlow vs Raw Claude CLI

Real results from running the same tasks both ways. Executed April 12, 2026 on Claude Opus 4.6 (Max subscription).

Full trace: `traces/benchmark-2026-04-12.json`

Reproduce: `npx tsx examples/benchmark-comparison.ts`

## Results

### Task A: Simple code question

> "What does resolveStep do?"

|            | Raw CLI  | ClaudeFlow |
|------------|----------|------------|
| Time       | **8.1s** | 21.8s      |
| Cost       | $0.095   | $0.094     |
| Tokens     | 160      | 154        |

**Winner: Raw CLI.** For a single question, pipeline overhead adds ~13s. Same cost, same quality. Just use `claude -p "..."` directly.

**When this applies:** quick questions, one-off lookups, "what does X do?", explaining code.

---

### Task B: Structured code review

> Review pipeline.ts for error handling, type safety, and edge cases.

|              | Raw CLI    | ClaudeFlow   |
|--------------|------------|--------------|
| Time         | 48.1s      | 85.8s        |
| Cost         | $0.180     | $0.338       |
| Tokens       | 1,667      | 1,325        |
| Steps        | 1          | 3            |
| Issues found | unstructured | **23 (typed JSON)** |

**Winner: ClaudeFlow.** Raw CLI does one pass and produces a wall of text. ClaudeFlow runs 3 focused checks (error handling → type safety → edge cases), each returning a typed `{ issues: string[] }` array. Found 23 specific issues with structured output you can programmatically process.

Takes longer and costs more, but the output is **structured, complete, and actionable**. The raw CLI response mixes concerns and may skip categories.

**When this applies:** code reviews, audits, any analysis with multiple categories of checks. The structured output matters — you can filter, count, and track issues over time.

---

### Task C: Multi-step improvement

> Find a bug, fix it, verify tests pass.

|              | Raw CLI    | ClaudeFlow   |
|--------------|------------|--------------|
| Time         | 180.0s     | 192.4s       |
| Cost         | timeout*   | $0.716       |
| Tokens       | 0*         | 5,796        |
| Steps        | 1          | 3            |
| Tests verified | unknown  | **yes**      |
| Trace saved  | no         | **yes**      |
| Retryable    | no         | **yes**      |

*Raw CLI timed out at 180s — 0 tokens recorded, no result.

**Winner: ClaudeFlow.** The raw CLI attempted everything in one shot and timed out. ClaudeFlow split it into 3 steps (audit → implement → verify), each within its own timeout. Step 2 has retry logic — if the fix breaks tests, it tries again.

The trace proves what happened: which bugs were found, what was fixed, that tests pass. Raw CLI produces nothing on timeout.

**When this applies:** any multi-step work — bug fixes, feature implementation, refactoring. The retry logic and verification steps are what make it reliable. You don't ship broken code because step 3 catches it.

---

## When to use what

| Scenario | Use | Why |
|----------|-----|-----|
| Quick question | Raw CLI | Faster, no overhead |
| One-off code explanation | Raw CLI | Same quality, less setup |
| Structured analysis (multiple checks) | ClaudeFlow | Typed output, more thorough |
| Multi-step work (implement + verify) | ClaudeFlow | Retries, verification, traces |
| Repeated task (daily/weekly) | ClaudeFlow | Reusable YAML, consistent results |
| Team work | ClaudeFlow | Pipeline is reviewable in PRs |
| Budget-sensitive | ClaudeFlow | Analyzer predicts cost before running |
| Overnight/long tasks | ClaudeFlow | Checkpoints, partial results on failure |

## The real value

It's not just about speed or cost. It's about:

1. **Traces** — every run produces proof of what was done. Share with your team, your boss, your reviewer.
2. **Structure** — typed outputs you can process programmatically, not walls of text.
3. **Reliability** — retries and verification steps. Raw CLI: one failure = nothing. ClaudeFlow: step 2 fails, retry, continue.
4. **Reusability** — define once as YAML, run daily. Raw CLI: retype every time.
5. **Predictability** — the analyzer tells you cost/time before running. No surprises.

## Cost analysis

| Pipeline type | Typical cost | Break-even vs manual |
|---------------|-------------|---------------------|
| Simple audit (3 steps) | $0.30-0.50 | 1 run |
| Code review (3 checks) | $0.30-0.40 | 1 run |
| Full improvement (audit+fix+verify) | $0.50-0.80 | 1 run |
| Daily health check | $0.05-0.10 | Saves 15 min/day |

At $0.50 per improvement cycle, running 10 per day = $5/day = $150/month. That's less than 1 hour of engineer time producing more consistent, traceable output.
