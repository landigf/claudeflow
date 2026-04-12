import { describe, expect, it } from "vitest";
import { step, pipeline, z, MockRuntime } from "../../src/index.js";

describe("pipeline", () => {
  it("runs a simple two-step pipeline with mock runtime", async () => {
    const summarize = step("summarize")
      .input(z.object({ url: z.string() }))
      .output(z.object({ title: z.string(), summary: z.string() }))
      .prompt("Summarize the content at {url}");

    const classify = step("classify")
      .output(z.object({ category: z.string(), confidence: z.number() }))
      .prompt("Classify this summary: {summarize.summary}");

    const myPipeline = pipeline("test-pipeline").step(summarize).step(classify);

    const mock = new MockRuntime({
      summarize: { title: "Test Article", summary: "This is about AI pipelines" },
      classify: { category: "tech", confidence: 0.95 },
    });

    const result = await myPipeline.run({ url: "https://example.com" }, { runtime: mock });

    expect(result.trace.status).toBe("completed");
    expect(result.trace.steps).toHaveLength(2);
    expect(result.trace.pipelineName).toBe("test-pipeline");
    expect(result.output).toEqual({ category: "tech", confidence: 0.95 });
  });

  it("retries a failing step", async () => {
    let callCount = 0;
    const flaky = step("flaky")
      .output(z.object({ result: z.string() }))
      .prompt("do something")
      .retry({ maxAttempts: 3, backoff: "fixed", baseDelayMs: 10 });

    const myPipeline = pipeline("retry-test").step(flaky);

    const mock: MockRuntime = {
      calls: [],
      execute: async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error("temporary failure");
        }
        return {
          text: JSON.stringify({ result: "success" }),
          usage: { inputTokens: 10, outputTokens: 5 },
          costUsd: 0.001,
          durationMs: 100,
          model: "mock",
        };
      },
    } as unknown as MockRuntime;

    const result = await myPipeline.run({}, { runtime: mock });

    expect(result.trace.status).toBe("completed");
    expect(result.trace.steps[0].attempts).toHaveLength(3);
    expect(callCount).toBe(3);
  });

  it("runs a deterministic step without LLM", async () => {
    const double = step("double")
      .fn((input: unknown) => {
        const { value } = input as { value: number };
        return { result: value * 2 };
      });

    const myPipeline = pipeline("deterministic-test").step(double);

    const mock = new MockRuntime({});
    const result = await myPipeline.run({ value: 21 }, { runtime: mock });

    expect(result.output).toEqual({ result: 42 });
    expect(result.trace.steps[0].attempts).toHaveLength(0); // no LLM calls
    expect(mock.calls).toHaveLength(0); // runtime not called
  });

  it("produces a complete trace with timing and tokens", async () => {
    const myStep = step("traced").prompt("hello");
    const myPipeline = pipeline("trace-test").step(myStep);

    const mock = new MockRuntime({ traced: "world" });
    const result = await myPipeline.run({}, { runtime: mock });

    expect(result.trace.runId).toBeTruthy();
    expect(result.trace.startedAt).toBeInstanceOf(Date);
    expect(result.trace.finishedAt).toBeInstanceOf(Date);
    expect(result.trace.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.trace.steps[0].stepId).toBe("traced");
  });

  it("interpolates variables in prompt templates", async () => {
    const greet = step("greet").prompt("Hello {name}, you are {age} years old");
    const myPipeline = pipeline("interpolation-test").step(greet);

    const mock = new MockRuntime({ greet: "greeting response" });
    await myPipeline.run({ name: "Gennaro", age: 25 }, { runtime: mock });

    expect(mock.calls[0].prompt).toBe("Hello Gennaro, you are 25 years old");
  });

  it("chains step outputs via context", async () => {
    const first = step("first")
      .output(z.object({ value: z.string() }))
      .prompt("produce a value");

    const second = step("second")
      .prompt("use the value: {first.value}");

    const myPipeline = pipeline("chain-test").step(first).step(second);

    const mock = new MockRuntime({
      first: { value: "hello" },
      second: "used hello",
    });

    await myPipeline.run({}, { runtime: mock });

    // The second step's prompt should have the first step's output interpolated
    expect(mock.calls[1].prompt).toBe("use the value: hello");
  });
});
