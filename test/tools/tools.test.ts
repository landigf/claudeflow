import { describe, expect, it } from "vitest";
import { step, pipeline, z, MockRuntime, ShellTool, FileTool, EvalTool, optimize } from "../../src/index.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("ShellTool", () => {
  it("runs a command and captures output", async () => {
    const shell = new ShellTool();
    const result = await shell.execute("run", { command: "echo hello" }) as { stdout: string; exitCode: number };
    expect(result.stdout).toBe("hello");
    expect(result.exitCode).toBe(0);
  });

  it("captures exit code on failure", async () => {
    const shell = new ShellTool();
    const result = await shell.execute("run", { command: "exit 42" }) as { exitCode: number };
    expect(result.exitCode).toBe(42);
  });

  it("throws on unknown action", async () => {
    const shell = new ShellTool();
    await expect(shell.execute("unknown", {})).rejects.toThrow("unknown action");
  });
});

describe("FileTool", () => {
  it("reads and writes files", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cf-file-"));
    const file = new FileTool();

    await file.execute("write", { path: path.join(dir, "test.txt"), content: "hello world" });
    const result = await file.execute("read", { path: path.join(dir, "test.txt") }) as { content: string };
    expect(result.content).toBe("hello world");
  });

  it("checks file existence", async () => {
    const file = new FileTool();
    const result = await file.execute("exists", { path: "/tmp/nonexistent-cf-test" }) as { exists: boolean };
    expect(result.exists).toBe(false);
  });
});

describe("EvalTool", () => {
  it("runs a command and extracts a metric", async () => {
    const eval_ = new EvalTool();
    const result = await eval_.execute("run", {
      command: 'echo "accuracy: 0.847"',
      extractMetric: "accuracy: (\\d+\\.\\d+)",
    }) as { metric: number; success: boolean };
    expect(result.metric).toBe(0.847);
    expect(result.success).toBe(true);
  });

  it("returns null metric when no match", async () => {
    const eval_ = new EvalTool();
    const result = await eval_.execute("run", {
      command: "echo no metrics here",
      extractMetric: "score: (\\d+)",
    }) as { metric: number | null };
    expect(result.metric).toBeNull();
  });
});

describe("pipeline with tool nodes", () => {
  it("executes a tool node in a pipeline", async () => {
    const tools = new Map();
    tools.set("shell", new ShellTool());

    const p = pipeline("tool-test")
      .tool({ id: "run-echo", adapter: "shell", action: "run", params: { command: "echo pipeline-tool-works" } });

    const mock = new MockRuntime({});
    const result = await p.run({}, { runtime: mock, tools });

    expect(result.trace.status).toBe("completed");
    expect(result.trace.steps).toHaveLength(1);
    expect(result.trace.steps[0].stepId).toBe("run-echo");
    const output = result.output as { stdout: string };
    expect(output.stdout).toBe("pipeline-tool-works");
  });

  it("interpolates tool params from context", async () => {
    const tools = new Map();
    tools.set("shell", new ShellTool());

    const s = step("produce").output(z.object({ name: z.string() })).prompt("produce");
    const p = pipeline("interp-tool")
      .step(s)
      .tool({ id: "greet", adapter: "shell", action: "run", params: { command: "echo hello {produce.name}" } });

    const mock = new MockRuntime({ produce: { name: "world" } });
    const result = await p.run({}, { runtime: mock, tools });

    const output = result.output as { stdout: string };
    expect(output.stdout).toBe("hello world");
  });
});

describe("optimize loop", () => {
  it("runs the autoresearch pattern: mutate → evaluate → keep/discard", async () => {
    let iteration = 0;
    const mutateStep = step("improve").prompt("improve the code");
    const evalStep = step("measure").fn(async () => {
      iteration++;
      return { score: 50 + iteration * 15 }; // 65, 80, 95
    });

    const optimizeDef = optimize(mutateStep, evalStep, {
      metricKey: "score",
      direction: "higher",
      maxIterations: 3,
    });

    const p = pipeline("optimize-test").optimize(optimizeDef);
    const mock = new MockRuntime({ improve: "improved" });
    const result = await p.run({}, { runtime: mock });

    expect(result.trace.status).toBe("completed");
    const optResults = (result.output as Record<string, unknown>);
    // baseline eats iteration 1 (score=65), then 3 iterations: 80, 95, 110
    expect(optResults.bestMetric).toBe(110);
    expect(optResults.totalIterations).toBe(3);
  });

  it("discards iterations that don't improve", async () => {
    let iteration = 0;
    const mutateStep = step("tweak").prompt("tweak");
    const evalStep = step("eval").fn(async () => {
      iteration++;
      // Score goes up then down: 60, 70, 50, 80
      const scores = [60, 70, 50, 80];
      return { val: scores[iteration - 1] ?? 0 };
    });

    const optimizeDef = optimize(mutateStep, evalStep, {
      metricKey: "val",
      direction: "higher",
      maxIterations: 4,
    });

    const p = pipeline("discard-test").optimize(optimizeDef);
    const mock = new MockRuntime({ tweak: "tweaked" });
    const result = await p.run({}, { runtime: mock });

    const optResults = result.output as { bestMetric: number; keptCount: number; attempts: Array<{ kept: boolean }> };
    // baseline eats iteration 1 (score=60), then 4 iterations with scores: 70, 50, 80, (out of range)
    // Actually: fn is called for baseline(=60) then iter1(=70>60 keep), iter2(=50<70 discard), iter3(=80>70 keep), iter4(out of scores array, =0<80 discard)
    // But we only have 4 scores total and baseline takes one, so 3 loop iterations
    // Baseline: iteration=1→60. Loop: iter1: iteration=2→70(keep), iter2: iteration=3→50(discard), iter3: iteration=4→80(keep), iter4: iteration=5→0(NaN, discard)
    expect(optResults.bestMetric).toBe(80);
    expect(optResults.keptCount).toBe(2); // 70 and 80 kept
    expect(optResults.attempts[1].kept).toBe(false); // iteration 2 (score=50) discarded
  });
});
