import { describe, expect, it } from "vitest";
import { MockRuntime, branch, loop, map, pipeline, step, z } from "../../src/index.js";

describe("pipeline — basic steps", () => {
  it("runs a two-step pipeline with context chaining", async () => {
    const summarize = step("summarize")
      .input(z.object({ url: z.string() }))
      .output(z.object({ title: z.string(), summary: z.string() }))
      .prompt("Summarize the content at {url}");

    const classify = step("classify")
      .output(z.object({ category: z.string(), confidence: z.number() }))
      .prompt("Classify this summary: {summarize.summary}");

    const p = pipeline("test").step(summarize).step(classify);

    const mock = new MockRuntime({
      summarize: { title: "Test Article", summary: "This is about AI pipelines" },
      classify: { category: "tech", confidence: 0.95 },
    });

    const result = await p.run({ url: "https://example.com" }, { runtime: mock });

    expect(result.trace.status).toBe("completed");
    expect(result.trace.steps).toHaveLength(2);
    expect(result.output).toEqual({ category: "tech", confidence: 0.95 });
  });

  it("interpolates variables from input and previous steps", async () => {
    const greet = step("greet").prompt("Hello {name}, you are {age} years old");
    const p = pipeline("interp").step(greet);

    const mock = new MockRuntime({ greet: "response" });
    await p.run({ name: "Gennaro", age: 25 }, { runtime: mock });

    expect(mock.calls[0].prompt).toBe("Hello Gennaro, you are 25 years old");
  });

  it("chains step outputs into next step's prompt", async () => {
    const first = step("first")
      .output(z.object({ value: z.string() }))
      .prompt("produce a value");
    const second = step("second").prompt("use: {first.value}");

    const mock = new MockRuntime({ first: { value: "hello" }, second: "done" });
    await pipeline("chain").step(first).step(second).run({}, { runtime: mock });

    expect(mock.calls[1].prompt).toBe("use: hello");
  });

  it("runs a deterministic step without calling the runtime", async () => {
    const double = step("double").fn((input: unknown) => {
      const { value } = input as { value: number };
      return { result: value * 2 };
    });

    const mock = new MockRuntime({});
    const result = await pipeline("det").step(double).run({ value: 21 }, { runtime: mock });

    expect(result.output).toEqual({ result: 42 });
    expect(result.trace.steps[0].attempts).toHaveLength(0);
    expect(mock.calls).toHaveLength(0);
  });
});

describe("pipeline — retry and fallback", () => {
  it("retries a failing step up to maxAttempts", async () => {
    let callCount = 0;
    const flaky = step("flaky")
      .output(z.object({ ok: z.boolean() }))
      .prompt("do something")
      .retry({ maxAttempts: 3, backoff: "fixed", baseDelayMs: 10 });

    const runtime = {
      async execute() {
        callCount++;
        if (callCount < 3) throw new Error("temp failure");
        return {
          text: JSON.stringify({ ok: true }),
          usage: { inputTokens: 10, outputTokens: 5 },
          costUsd: 0.001,
          durationMs: 50,
          model: "mock",
        };
      },
    };

    const result = await pipeline("retry").step(flaky).run({}, { runtime });

    expect(result.trace.status).toBe("completed");
    expect(result.trace.steps[0].attempts).toHaveLength(3);
    expect(callCount).toBe(3);
  });

  it("marks pipeline as failed after exhausting retries", async () => {
    const failing = step("failing")
      .prompt("always fail")
      .retry({ maxAttempts: 2, backoff: "fixed", baseDelayMs: 10 });

    const runtime = {
      async execute() {
        throw new Error("permanent failure");
      },
    };

    const result = await pipeline("fail").step(failing).run({}, { runtime });
    expect(result.trace.status).toBe("failed");
    expect(result.trace.steps[0].status).toBe("failed");
  });

  it("retries empty responses and keeps attempt usage", async () => {
    let callCount = 0;
    const flaky = step("empty")
      .output(z.object({ ok: z.boolean() }))
      .prompt("return json")
      .retry({ maxAttempts: 2, backoff: "fixed", baseDelayMs: 1 });

    const runtime = {
      async execute() {
        callCount++;
        if (callCount === 1) {
          return {
            text: "   ",
            usage: { inputTokens: 40, outputTokens: 0 },
            costUsd: 0.02,
            durationMs: 5,
            model: "mock",
          };
        }
        return {
          text: JSON.stringify({ ok: true }),
          usage: { inputTokens: 10, outputTokens: 5 },
          costUsd: 0.001,
          durationMs: 5,
          model: "mock",
        };
      },
    };

    const result = await pipeline("empty-retry").step(flaky).run({}, { runtime });

    expect(result.trace.status).toBe("completed");
    expect(result.trace.steps[0].attempts).toHaveLength(2);
    expect(result.trace.steps[0].attempts[0].usage.inputTokens).toBe(40);
    expect(callCount).toBe(2);
  });
});

describe("pipeline — loop", () => {
  it("repeats a step until condition is met", async () => {
    let iteration = 0;
    const refine = step("refine")
      .output(z.object({ score: z.number() }))
      .prompt("improve");

    const loopDef = loop(
      refine,
      (ctx) => ((ctx.state.refine as { score: number })?.score ?? 0) >= 0.9,
      { maxIterations: 5 },
    );

    const runtime = {
      async execute() {
        iteration++;
        return {
          text: JSON.stringify({ score: iteration * 0.3 }),
          usage: { inputTokens: 10, outputTokens: 5 },
          costUsd: 0.001,
          durationMs: 10,
          model: "mock",
        };
      },
    };

    const result = await pipeline("loop-test").loop(loopDef).run({}, { runtime });

    expect(result.trace.status).toBe("completed");
    // 0.3, 0.6, 0.9 (floating point: 3*0.3=0.899...) so needs 4th: 1.2
    expect(iteration).toBe(4);
  });

  it("respects maxIterations", async () => {
    const counter = step("count").prompt("count");
    const loopDef = loop(counter, () => false, { maxIterations: 3 });

    let calls = 0;
    const runtime = {
      async execute() {
        calls++;
        return {
          text: "ok",
          usage: { inputTokens: 1, outputTokens: 1 },
          costUsd: 0,
          durationMs: 1,
          model: "m",
        };
      },
    };

    await pipeline("max-iter").loop(loopDef).run({}, { runtime });
    expect(calls).toBe(3);
  });
});

describe("pipeline — branch", () => {
  it("takes the true branch when condition is met", async () => {
    const setup = step("setup")
      .output(z.object({ confidence: z.number() }))
      .prompt("setup");

    const publish = step("publish").prompt("publish");
    const review = step("review").prompt("review");

    const branchDef = branch(
      (ctx) => (ctx.state.setup as { confidence: number }).confidence > 0.8,
      { true: publish, false: review },
    );

    const mock = new MockRuntime({
      setup: { confidence: 0.95 },
      publish: "published",
      review: "reviewed",
    });

    const result = await pipeline("branch-test")
      .step(setup)
      .branch(branchDef)
      .run({}, { runtime: mock });

    expect(result.trace.steps).toHaveLength(2);
    expect(result.trace.steps[1].stepId).toBe("publish");
  });

  it("takes the false branch when condition is not met", async () => {
    const setup = step("setup")
      .output(z.object({ confidence: z.number() }))
      .prompt("setup");
    const publish = step("publish").prompt("publish");
    const review = step("review").prompt("review");

    const branchDef = branch(
      (ctx) => (ctx.state.setup as { confidence: number }).confidence > 0.8,
      { true: publish, false: review },
    );

    const mock = new MockRuntime({
      setup: { confidence: 0.5 },
      publish: "published",
      review: "reviewed",
    });

    const result = await pipeline("branch-false")
      .step(setup)
      .branch(branchDef)
      .run({}, { runtime: mock });

    expect(result.trace.steps[1].stepId).toBe("review");
  });
});

describe("pipeline — map", () => {
  it("runs a step over each item in an array", async () => {
    const produce = step("produce")
      .output(z.object({ items: z.array(z.object({ name: z.string() })) }))
      .prompt("produce items");

    const process = step("process").prompt("process {item.name}");

    const mapDef = map("produce.items", process);

    const mock = new MockRuntime({
      produce: { items: [{ name: "A" }, { name: "B" }, { name: "C" }] },
      process: "processed",
    });

    const result = await pipeline("map-test").step(produce).map(mapDef).run({}, { runtime: mock });

    expect(result.trace.status).toBe("completed");
    // 1 produce + 3 map items
    expect(result.trace.steps).toHaveLength(4);
    // The map prompts should have the item interpolated
    expect(mock.calls[1].prompt).toBe("process A");
    expect(mock.calls[2].prompt).toBe("process B");
    expect(mock.calls[3].prompt).toBe("process C");
  });
});

describe("pipeline — model selection", () => {
  it("passes per-step model to runtime", async () => {
    const cheap = step("cheap").prompt("fast task").useModel("claude-haiku-4-5");
    const smart = step("smart").prompt("hard task").useModel("claude-opus-4-6");
    const p = pipeline("model-test").step(cheap).step(smart);

    const mock = new MockRuntime({ cheap: "fast", smart: "deep" });
    await p.run({}, { runtime: mock });

    expect(mock.calls[0].model).toBe("claude-haiku-4-5");
    expect(mock.calls[1].model).toBe("claude-opus-4-6");
  });

  it("passes per-step timeout to runtime", async () => {
    const timed = step("timed").prompt("slow task").timeout(2_500);
    const mock = new MockRuntime({ timed: "ok" });

    await pipeline("timeout").step(timed).run({}, { runtime: mock });

    expect(mock.calls[0].timeoutMs).toBe(2_500);
  });

  it("uses no model override when not specified", async () => {
    const plain = step("plain").prompt("default model");
    const p = pipeline("no-model").step(plain);

    const mock = new MockRuntime({ plain: "ok" });
    await p.run({}, { runtime: mock });

    expect(mock.calls[0].model).toBeUndefined();
  });
});

describe("pipeline — trace", () => {
  it("produces a complete trace with metadata", async () => {
    const s = step("traced").prompt("hello");
    const mock = new MockRuntime({ traced: "world" });
    const result = await pipeline("trace-test").step(s).run({}, { runtime: mock });

    expect(result.trace.runId).toBeTruthy();
    expect(result.trace.pipelineName).toBe("trace-test");
    expect(result.trace.startedAt).toBeInstanceOf(Date);
    expect(result.trace.finishedAt).toBeInstanceOf(Date);
    expect(result.trace.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.trace.steps[0].stepId).toBe("traced");
    expect(result.trace.steps[0].inputSnapshot).toBeDefined();
  });
});
