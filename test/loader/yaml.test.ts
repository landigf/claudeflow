import path from "node:path";
import { describe, expect, it } from "vitest";
import { MockRuntime, loadYaml, parseYamlString } from "../../src/index.js";

describe("YAML loader", () => {
  it("loads a pipeline from a YAML file", () => {
    const p = loadYaml(path.join(import.meta.dirname, "../fixtures/simple-pipeline.yaml"));

    expect(p.name).toBe("test-pipeline");
    expect(p.nodes).toHaveLength(2);
    expect(p.nodes[0].type).toBe("step");
  });

  it("runs a YAML-loaded pipeline with MockRuntime", async () => {
    const p = loadYaml(path.join(import.meta.dirname, "../fixtures/simple-pipeline.yaml"));

    const mock = new MockRuntime({
      summarize: { title: "Test", summary: "AI pipelines" },
      classify: { category: "tech", confidence: 0.9 },
    });

    const result = await p.run({ url: "https://example.com" }, { runtime: mock });

    expect(result.trace.status).toBe("completed");
    expect(result.trace.steps).toHaveLength(2);
    expect(result.output).toEqual({ category: "tech", confidence: 0.9 });
  });

  it("parses step with retry config", () => {
    const p = loadYaml(path.join(import.meta.dirname, "../fixtures/simple-pipeline.yaml"));
    const classifyNode = p.nodes[1];
    if (classifyNode.type !== "step") throw new Error("expected step");
    expect(classifyNode.step.retry?.maxAttempts).toBe(2);
  });

  it("parses step timeout config", () => {
    const yaml = `
name: timeout-test
steps:
  - id: review
    prompt: "review {code}"
    timeout: 120000
`;
    const p = parseYamlString(yaml);
    const reviewNode = p.nodes[0];
    if (reviewNode.type !== "step") throw new Error("expected step");
    expect(reviewNode.step.timeoutMs).toBe(120000);
  });

  it("parses YAML string directly", () => {
    const yaml = `
name: inline-test
steps:
  - id: greet
    prompt: "Hello {name}"
`;
    const p = parseYamlString(yaml);
    expect(p.name).toBe("inline-test");
    expect(p.nodes).toHaveLength(1);
  });

  it("parses branch control flow", async () => {
    const yaml = `
name: branch-test
steps:
  - id: check
    prompt: "check"
    output:
      score: number
  - id: decide
    branch:
      condition: "check.score > 0.5"
      true:
        id: accept
        prompt: "accepted"
      false:
        id: reject
        prompt: "rejected"
`;
    const p = parseYamlString(yaml);
    expect(p.nodes).toHaveLength(2);
    expect(p.nodes[1].type).toBe("branch");

    const mock = new MockRuntime({
      check: { score: 0.8 },
      accept: "ok",
      reject: "no",
    });
    const result = await p.run({}, { runtime: mock });
    expect(result.trace.steps[1].stepId).toBe("accept");
  });

  it("parses map control flow", async () => {
    const yaml = `
name: map-test
steps:
  - id: produce
    prompt: "produce items"
    output:
      items:
        type: array
        items: string
  - id: process
    map: produce.items
    prompt: "process {item}"
`;
    const p = parseYamlString(yaml);
    expect(p.nodes).toHaveLength(2);
    expect(p.nodes[1].type).toBe("map");

    const mock = new MockRuntime({
      produce: { items: ["a", "b"] },
      process: "done",
    });
    const result = await p.run({}, { runtime: mock });
    expect(result.trace.steps).toHaveLength(3); // 1 produce + 2 map items
  });

  it("parses tool nodes from YAML", async () => {
    const yaml = `
name: tool-test
steps:
  - id: run-echo
    tool: shell
    action: run
    params:
      command: "echo hello"
`;
    const p = parseYamlString(yaml);
    expect(p.nodes).toHaveLength(1);
    expect(p.nodes[0].type).toBe("tool");

    const { ShellTool } = await import("../../src/tools/shell.js");
    const tools = new Map();
    tools.set("shell", new ShellTool());
    const mock = new MockRuntime({});
    const result = await p.run({}, { runtime: mock, tools });
    expect(result.trace.status).toBe("completed");
    const output = result.output as { stdout: string };
    expect(output.stdout).toBe("hello");
  });

  it("parses optimize block from YAML", () => {
    const yaml = `
name: optimize-test
steps:
  - id: setup
    prompt: "setup"
optimize:
  mutate:
    id: improve
    prompt: "improve the code"
  evaluate:
    id: measure
    prompt: "measure quality"
  metric: score
  direction: higher
  maxIterations: 5
`;
    const p = parseYamlString(yaml);
    // 1 regular step + 1 optimize node
    expect(p.nodes).toHaveLength(2);
    expect(p.nodes[0].type).toBe("step");
    expect(p.nodes[1].type).toBe("optimize");
  });

  it("throws on invalid YAML (missing name)", () => {
    expect(() => parseYamlString("steps: []")).toThrow("must have a 'name' field");
  });

  it("throws on invalid YAML (missing steps)", () => {
    expect(() => parseYamlString("name: test")).toThrow("must have a 'steps' array");
  });
});
