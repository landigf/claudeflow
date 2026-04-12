# ClaudeFlow Cookbook — How to Use Every Feature

Practical recipes for real work. Each recipe shows the YAML pipeline AND the TypeScript equivalent.

---

## 1. Simple Question (just use raw Claude CLI)

**When:** You need a quick answer. No structure needed.

Don't use ClaudeFlow for this — it adds overhead. Just run:
```bash
echo "What does this function do?" | claude -p -
```

ClaudeFlow is for multi-step, structured, repeatable work.

---

## 2. Code Review with Multiple Focused Checks

**When:** You want thorough, structured review — not a wall of text.

```yaml
name: code-review
steps:
  - id: security
    prompt: "Read {file}. List ONLY security issues — injection, XSS, auth bypass, secrets."
    output: { issues: { type: array, items: string } }

  - id: performance
    prompt: "Read {file}. List ONLY performance issues — N+1 queries, missing indexes, unbounded loops."
    output: { issues: { type: array, items: string } }

  - id: maintainability
    prompt: "Read {file}. List ONLY maintainability issues — complexity, duplication, naming, missing tests."
    output: { issues: { type: array, items: string } }
```

**Why better than raw CLI:** Each check is focused. You get typed arrays, not a wall of text. You can add/remove checks without losing others.

---

## 3. Bug Investigation → Auto-fix → PR

**When:** You have an error log and want it diagnosed, fixed, and PR'd automatically.

```yaml
name: fix-bug
steps:
  - id: diagnose
    prompt: |
      Error log: {error}
      Read the source code and find the root cause.
      Be specific — file, line, what's wrong, why.
    output: { file: string, root_cause: string, fix_approach: string }

  - id: check-existing
    tool: github
    action: search-issues
    params: { repo: "{repo}", query: "{diagnose.root_cause}" }

  - id: fix
    prompt: "Fix this: {diagnose.fix_approach} in {diagnose.file}"
    tools: [Read, Write, Edit, Bash]
    retry: { maxAttempts: 2 }

  - id: verify
    tool: shell
    action: run
    params: { command: "npm test" }

  - id: pr
    tool: github
    action: create-pr
    params:
      repo: "{repo}"
      title: "fix: {diagnose.root_cause}"
      body: "Root cause: {diagnose.root_cause}\nFix: {diagnose.fix_approach}"
```

---

## 4. Optimize a Metric Overnight (Autoresearch Pattern)

**When:** You have a measurable metric and want to improve it autonomously.

```yaml
name: optimize-test-coverage
steps:
  - id: setup
    tool: shell
    action: run
    params: { command: "npm test -- --coverage 2>&1 | tail -5" }

optimize:
  mutate:
    id: improve
    prompt: |
      Current coverage: {_best_metric}%
      Previous attempts: {_memory.attempts}
      Add tests to improve coverage. Focus on uncovered files.
      Run: npm test -- --coverage
    tools: [Read, Write, Edit, Bash]
  evaluate:
    id: measure
    tool: eval
    action: run
    params:
      command: "npm test -- --coverage 2>&1 | grep 'All files'"
      extractMetric: "All files.*?\\|\\s+(\\d+\\.?\\d*)"
  metric: coverage
  direction: higher
  maxIterations: 10
```

**What happens:**
1. Measures baseline coverage
2. LLM adds tests → commits → measures again
3. If coverage improved → keep. If not → `git reset --hard` (discard)
4. Repeats up to 10 times
5. You wake up to higher coverage + a trace of every attempt

**Works for:** test coverage, API latency, bundle size, linter score, benchmark speed, prompt accuracy.

---

## 5. Multi-Agent Code Review (CrewAI-style)

**When:** You want specialized reviewers, each with different expertise.

```typescript
import { agent, assign, createCrew, step, pipeline } from "claudeflow";

const securityExpert = agent("security", {
  role: "Application Security Engineer",
  goal: "Find vulnerabilities and security anti-patterns",
  backstory: "OWASP Top 10 specialist, 10 years in appsec",
  model: "claude-opus-4-6",  // use the best model for security
});

const perfExpert = agent("perf", {
  role: "Performance Engineer",
  goal: "Find bottlenecks and optimization opportunities",
  backstory: "Specializes in Node.js and database query optimization",
  model: "claude-haiku-4-5",  // cheaper model is fine for perf checks
});

const crew = createCrew([
  { agent: securityExpert, step: step("sec-review").prompt("Review for security: {diff}") },
  { agent: perfExpert, step: step("perf-review").prompt("Review for performance: {diff}") },
]);

const review = pipeline("expert-review").step(crew[0]).step(crew[1]);
```

**Why:** Each agent has the right system prompt and model. Security gets Opus (thorough), perf gets Haiku (cheap). You pay for intelligence where it matters.

---

## 6. Research a Topic → Structured Report

**When:** You need to research something and produce a shareable report.

```bash
npx claudeflow run pipelines/research-topic.yaml \
  --input '{"topic": "prompt optimization techniques 2026"}' \
  --verbose
```

Pipeline does: search → find resources → compare approaches → write structured report.

Output is a trace you can share with your team: "here's what I found and how."

---

## 7. Security Audit with Real Tools

**When:** You want a security scan using industry-standard tools.

```bash
# Install tools (optional — pipeline falls back to grep if missing)
brew install semgrep trivy gitleaks

# Run on any project
npx claudeflow run pipelines/security-audit.yaml --cwd /path/to/project --verbose
```

Pipeline composes: Semgrep (static analysis) → Gitleaks (secrets) → Trivy (dependencies) → Claude (analyze all results together).

---

## 8. Prompt Testing with Promptfoo

**When:** You want to systematically test prompt quality before deploying.

```yaml
name: test-prompts
steps:
  - id: run-eval
    tool: promptfoo
    action: eval
    params:
      config: promptfooconfig.yaml

  - id: analyze
    prompt: |
      Promptfoo evaluation results:
      {run-eval.stdout}

      Which prompts performed best? Which failed?
      Suggest improvements for the worst-performing prompts.
```

**Prerequisites:** `npm install -g promptfoo` and a `promptfooconfig.yaml` defining your prompts and test cases.

---

## 9. Export Traces to Observability Backend

**When:** You want pipeline traces in Langfuse, Jaeger, or Grafana Tempo.

```typescript
import { pipeline, step, ClaudeCliRuntime, traceToOtlp, exportToOtlp } from "claudeflow";

const result = await myPipeline.run(input, { runtime });

// Export to any OTLP collector
await exportToOtlp(result.trace, "http://localhost:4318/v1/traces");

// Or save as OTLP JSON for later import
import { writeFileSync } from "fs";
writeFileSync("trace.otlp.json", JSON.stringify(traceToOtlp(result.trace), null, 2));
```

---

## 10. DSPy-style Prompt Optimization

**When:** You want to automatically improve a prompt's accuracy using eval data.

```yaml
name: optimize-classifier
optimize:
  mutate:
    id: rewrite-prompt
    prompt: |
      Current classifier prompt: {_memory.current_prompt}
      Accuracy: {_best_metric}%
      Errors: {_memory.recent_errors}

      Rewrite the prompt to fix the errors. Keep it concise.
      Save the new prompt to classifier-prompt.txt.
    tools: [Read, Write]
  evaluate:
    id: eval
    tool: eval
    action: run
    params:
      command: "python eval_classifier.py --prompt-file classifier-prompt.txt"
      extractMetric: "accuracy: (\\d+\\.\\d+)"
  metric: accuracy
  direction: higher
  maxIterations: 15
```

This is the DSPy optimization loop without Python/DSPy. Works with any eval script.

---

## 11. Daily Codebase Health Check

**When:** Run every morning to catch issues before they pile up.

```yaml
name: daily-health
steps:
  - id: tests
    tool: shell
    action: run
    params: { command: "npm test 2>&1 | tail -10" }

  - id: types
    tool: shell
    action: run
    params: { command: "npx tsc --noEmit 2>&1 | tail -10" }

  - id: deps
    tool: shell
    action: run
    params: { command: "npm audit 2>&1 | tail -10" }

  - id: stale-branches
    tool: shell
    action: run
    params: { command: "git branch --merged main | grep -v main | head -10 || echo 'No stale branches'" }

  - id: todos
    tool: shell
    action: run
    params: { command: "grep -rn 'TODO\\|FIXME\\|HACK' src/ --include='*.ts' | wc -l" }

  - id: report
    prompt: |
      Daily health check results:
      Tests: {tests.stdout}
      Types: {types.stdout}
      Dependencies: {deps.stdout}
      Stale branches: {stale-branches.stdout}
      TODOs/FIXMEs: {todos.stdout}

      Rate overall health: GREEN / YELLOW / RED
      List any action items.
```

Schedule with cron: `0 8 * * * cd /project && npx claudeflow run pipelines/daily-health.yaml`

---

## 12. Pre-merge Quality Gate

**When:** Run before merging any PR.

```yaml
name: pre-merge
steps:
  - id: tests
    tool: shell
    action: run
    params: { command: "npm test 2>&1" }

  - id: types
    tool: shell
    action: run
    params: { command: "npx tsc --noEmit 2>&1" }

  - id: lint
    tool: shell
    action: run
    params: { command: "npx biome check src/ 2>&1 | tail -20" }

  - id: diff
    tool: shell
    action: run
    params: { command: "git diff main...HEAD --stat" }

  - id: review
    prompt: |
      Pre-merge check results:
      Tests: exit {tests.exitCode}
      Types: exit {types.exitCode}
      Lint: {lint.stdout}
      Diff: {diff.stdout}

      Are there any blockers for merging?
    output:
      merge_safe: boolean
      blockers:
        type: array
        items: string

  - id: gate
    branch:
      condition: "review.merge_safe == true"
      true:
        id: approve
        prompt: "All checks passed. Safe to merge."
      false:
        id: block
        prompt: "BLOCKED. Issues: {review.blockers}"
```

---

## 13. Analyze Pipeline Cost Before Running

**When:** You want to know how much a pipeline will cost before spending anything.

```bash
npx claudeflow analyze pipelines/improve-self.yaml
```

Output:
```
Pipeline: improve-claudeflow
Steps: 3 (3 LLM, 0 deterministic)
Token estimate: ~991 (793-1487)
Cost estimate:
  claude-opus-4-6: $0.0411/run
  claude-haiku-4-5: $0.0022/run
Time estimate: ~100.0s
```

**Tip:** Use per-step model selection to cut costs. Research steps use Haiku ($0.80/M), analysis uses Sonnet ($3/M), critical decisions use Opus ($15/M).

---

## 14. Resume After Crash (Checkpointing)

**When:** You have a 10-step pipeline and step 7 crashes.

```typescript
import { pipeline, ClaudeCliRuntime, CheckpointManager } from "claudeflow";

const checkpoint = new CheckpointManager(".claudeflow/checkpoints");

// Run 1: crashes at step 7
await myPipeline.run(input, { runtime, checkpoint });

// Run 2: automatically resumes from step 7
await myPipeline.run(input, { runtime, checkpoint });
```

No wasted tokens. No re-running steps 1-6. Checkpoint is a JSON file you can inspect.

---

## 15. Use Memory Across Runs

**When:** Tomorrow's pipeline should know what yesterday's pipeline found.

```typescript
import { MemoryStore } from "claudeflow";

const memory = new MemoryStore(".claudeflow/memory");

// Yesterday's run saved results
// memory.set("last-audit", { date: "2026-04-11", issues: 5, fixed: 3 });

// Today's pipeline sees them via {_memory.last-audit}
await myPipeline.run({}, { runtime, memory });
```

Memory is just JSON files in `.claudeflow/memory/` — git-friendly, inspectable.

---

## When to Use What — Decision Guide

```
Need a quick answer?
  → Raw Claude CLI

Need structured output from one task?
  → ClaudeFlow with 1-2 steps

Need multi-step work with verification?
  → ClaudeFlow pipeline with tool steps

Need to optimize a metric?
  → ClaudeFlow optimize loop

Need team visibility?
  → YAML pipeline + trace export

Need overnight autonomous work?
  → Optimize loop with memory + checkpointing

Need specialized expertise?
  → Multi-agent with role assignment

Need to verify before merging?
  → Pre-merge quality gate pipeline

Need to audit security?
  → Security audit pipeline with real tools
```
