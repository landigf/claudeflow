import { describe, expect, it } from "vitest";
import {
  DspyTool,
  MockRuntime,
  PromptfooTool,
  agent,
  assign,
  createCrew,
  pipeline,
  step,
  traceToOtlp,
  z,
} from "../../src/index.js";

describe("multi-agent coordination", () => {
  it("assigns an agent role to a step", () => {
    const reviewer = agent("reviewer", {
      role: "Senior code reviewer",
      goal: "Find bugs and suggest improvements",
      backstory: "15 years of TypeScript experience",
    });

    const reviewStep = step("review").prompt("Review this code: {code}");
    const assigned = assign(reviewer, reviewStep);

    expect(assigned.id).toBe("reviewer:review");
    expect(assigned.systemPrompt).toContain("Senior code reviewer");
    expect(assigned.systemPrompt).toContain("Find bugs");
    expect(assigned.systemPrompt).toContain("15 years");
  });

  it("creates a crew of agents", () => {
    const researcher = agent("researcher", { role: "Researcher", goal: "Find information" });
    const developer = agent("developer", { role: "Developer", goal: "Write code" });
    const tester = agent("tester", { role: "QA Engineer", goal: "Write tests" });

    const crew = createCrew([
      { agent: researcher, step: step("research").prompt("Research {topic}") },
      { agent: developer, step: step("implement").prompt("Implement {research.findings}") },
      { agent: tester, step: step("test").prompt("Test {implement.code}") },
    ]);

    expect(crew).toHaveLength(3);
    expect(crew[0].id).toBe("researcher:research");
    expect(crew[1].id).toBe("developer:implement");
    expect(crew[2].id).toBe("tester:test");
  });

  it("runs a multi-agent pipeline with MockRuntime", async () => {
    const analyst = agent("analyst", { role: "Security analyst", goal: "Find vulnerabilities" });
    const fixer = agent("fixer", { role: "Developer", goal: "Fix security issues" });

    const crew = createCrew([
      {
        agent: analyst,
        step: step("scan")
          .prompt("Scan for vulnerabilities")
          .output(z.object({ issues: z.array(z.string()) })),
      },
      { agent: fixer, step: step("fix").prompt("Fix: {analyst:scan.issues}") },
    ]);

    const p = pipeline("security-crew").step(crew[0]).step(crew[1]);
    const mock = new MockRuntime({
      scan: { issues: ["SQL injection in login.ts"] },
      fix: "Fixed SQL injection",
    });

    // Need to match against the assigned step IDs
    const result = await p.run({}, { runtime: mock });
    expect(result.trace.status).toBe("completed");
    expect(result.trace.steps).toHaveLength(2);
  });

  it("preserves model preference from agent role", () => {
    const cheapAgent = agent("cheap", {
      role: "Helper",
      goal: "Quick tasks",
      model: "claude-haiku-4-5",
    });
    const assigned = assign(cheapAgent, step("task").prompt("do something"));

    expect(assigned.model).toBe("claude-haiku-4-5");
  });
});

describe("OpenTelemetry trace export", () => {
  it("converts a pipeline trace to OTLP format", async () => {
    const s = step("test").prompt("hello");
    const mock = new MockRuntime({ test: "world" });
    const result = await pipeline("otlp-test").step(s).run({}, { runtime: mock });

    const otlp = traceToOtlp(result.trace);

    expect(otlp.resourceSpans).toHaveLength(1);
    expect(otlp.resourceSpans[0].scopeSpans).toHaveLength(1);

    const spans = otlp.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(2); // root span + 1 step span

    // Root span
    expect(spans[0].name).toBe("pipeline:otlp-test");
    expect(spans[0].parentSpanId).toBe("");

    // Step span
    expect(spans[1].name).toBe("step:test");
    expect(spans[1].parentSpanId).toBe(spans[0].spanId);
  });

  it("includes claudeflow attributes in spans", async () => {
    const s = step("attr-test").prompt("hello");
    const mock = new MockRuntime({ "attr-test": "world" });
    const result = await pipeline("attrs").step(s).run({}, { runtime: mock });

    const otlp = traceToOtlp(result.trace);
    const rootAttrs = otlp.resourceSpans[0].scopeSpans[0].spans[0].attributes;

    const names = rootAttrs.map((a) => a.key);
    expect(names).toContain("claudeflow.pipeline.name");
    expect(names).toContain("claudeflow.pipeline.status");
    expect(names).toContain("claudeflow.pipeline.run_id");
    expect(names).toContain("claudeflow.cost.usd");
  });
});

describe("PromptfooTool", () => {
  it("throws on unknown action", async () => {
    const tool = new PromptfooTool();
    await expect(tool.execute("unknown", {})).rejects.toThrow("unknown action");
  });
});

describe("DspyTool", () => {
  it("returns optimization config", async () => {
    const tool = new DspyTool();
    const result = (await tool.execute("optimize", {
      prompt: "Summarize: {text}",
      evalCommand: "python eval.py",
      metricPattern: "accuracy: (\\d+\\.\\d+)",
      iterations: 5,
    })) as Record<string, unknown>;

    expect(result.type).toBe("optimization_config");
    expect(result.strategy).toBe("iterative_refinement");
    expect(result.iterations).toBe(5);
  });

  it("returns bootstrap config", async () => {
    const tool = new DspyTool();
    const result = (await tool.execute("bootstrap", {
      prompt: "Classify: {text}",
      examples: [{ input: "hello", expectedOutput: "greeting" }],
    })) as Record<string, unknown>;

    expect(result.type).toBe("bootstrap_config");
    expect(result.exampleCount).toBe(1);
  });

  it("throws on unknown action", async () => {
    const tool = new DspyTool();
    await expect(tool.execute("unknown", {})).rejects.toThrow("unknown action");
  });
});
