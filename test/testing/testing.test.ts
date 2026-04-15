import { describe, expect, it } from "vitest";
import { MockRuntime, benchmark, pipeline, step, validate, z } from "../../src/index.js";

describe("validate", () => {
  it("passes for a well-formed pipeline", () => {
    const s1 = step("fetch")
      .prompt("fetch {url}")
      .output(z.object({ data: z.string() }));
    const s2 = step("process")
      .prompt("process {fetch.data}")
      .output(z.object({ result: z.string() }));
    const p = pipeline("valid").step(s1).step(s2);

    const errors = validate(p);
    const realErrors = errors.filter((e) => e.severity === "error");
    expect(realErrors).toHaveLength(0);
  });

  it("warns about missing output schema", () => {
    const s = step("bare").prompt("do something");
    const p = pipeline("no-schema").step(s);

    const errors = validate(p);
    expect(errors.some((e) => e.message.includes("no output schema"))).toBe(true);
  });

  it("errors on step with no prompt and no fn", () => {
    const s = step("empty");
    const p = pipeline("empty-step").step(s.build());

    const errors = validate(p);
    expect(
      errors.some((e) => e.severity === "error" && e.message.includes("no prompt and no function")),
    ).toBe(true);
  });

  it("warns about referencing a step that hasn't run", () => {
    const s = step("late").prompt("use {nonexistent.value}");
    const p = pipeline("bad-ref").step(s);

    const errors = validate(p);
    expect(errors.some((e) => e.message.includes("nonexistent"))).toBe(true);
  });

  it("detects duplicate step IDs", () => {
    const s1 = step("dup").prompt("first");
    const s2 = step("dup").prompt("second");
    const p = pipeline("dup-test").step(s1).step(s2);

    const errors = validate(p);
    expect(errors.some((e) => e.message.includes("Duplicate step ID"))).toBe(true);
  });
});

describe("benchmark", () => {
  it("runs a pipeline N times and collects stats", async () => {
    const s = step("echo")
      .output(z.object({ value: z.number() }))
      .prompt("echo");
    const p = pipeline("bench-test").step(s);

    const mock = new MockRuntime({ echo: { value: 42 } });
    const stats = await benchmark(p, {}, { runtime: mock, runs: 5 });

    expect(stats.runs).toBe(5);
    expect(stats.successCount).toBe(5);
    expect(stats.failureCount).toBe(0);
    expect(stats.successRate).toBe(1);
    expect(stats.duration.avgMs).toBeGreaterThanOrEqual(0);
    expect(stats.duration.p50Ms).toBeGreaterThanOrEqual(0);
    expect(stats.duration.p95Ms).toBeGreaterThanOrEqual(0);
  });

  it("tracks failures in benchmark", async () => {
    let callCount = 0;
    const flaky = step("flaky").prompt("fail sometimes").retry({ maxAttempts: 1 });
    const p = pipeline("flaky-bench").step(flaky);

    const runtime = {
      async execute() {
        callCount++;
        if (callCount % 2 === 0) throw new Error("fail");
        return {
          text: "ok",
          usage: { inputTokens: 1, outputTokens: 1 },
          costUsd: 0,
          durationMs: 1,
          model: "m",
        };
      },
    };

    const stats = await benchmark(p, {}, { runtime, runs: 4 });

    expect(stats.runs).toBe(4);
    expect(stats.successCount).toBe(2);
    expect(stats.failureCount).toBe(2);
    expect(stats.successRate).toBe(0.5);
  });
});
