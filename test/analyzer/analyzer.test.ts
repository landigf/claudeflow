import { describe, expect, it } from "vitest";
import { step, pipeline, z, analyze, formatAnalysis, loop, branch } from "../../src/index.js";

describe("analyzer", () => {
  it("analyzes a simple two-step pipeline", () => {
    const s1 = step("summarize").prompt("Summarize {url}").output(z.object({ summary: z.string() }));
    const s2 = step("classify").prompt("Classify: {summarize.summary}").output(z.object({ category: z.string() }));
    const p = pipeline("test").step(s1).step(s2);

    const report = analyze(p);

    expect(report.pipelineName).toBe("test");
    expect(report.stepCount).toBe(2);
    expect(report.llmStepCount).toBe(2);
    expect(report.deterministicStepCount).toBe(0);
    expect(report.estimatedTokens.input.expected).toBeGreaterThan(0);
    expect(report.estimatedTokens.output.expected).toBeGreaterThan(0);
    expect(report.estimatedCost["claude-sonnet-4-6"].perRun).toBeGreaterThan(0);
    expect(report.estimatedDuration.sequentialMs).toBe(6000); // 2 LLM steps × 3s
  });

  it("detects warnings for steps without schema or retry", () => {
    const noSchema = step("bare").prompt("do something");
    const p = pipeline("warn-test").step(noSchema);

    const report = analyze(p);

    expect(report.schemaWarnings).toContain('Step "bare" has no output schema — output won\'t be validated');
    expect(report.schemaWarnings).toContain('Step "bare" has no retry config — single attempt only');
  });

  it("counts deterministic steps separately", () => {
    const llm = step("llm").prompt("think");
    const det = step("calc").fn(() => ({ result: 42 }));
    const p = pipeline("mixed").step(llm).step(det);

    const report = analyze(p);

    expect(report.llmStepCount).toBe(1);
    expect(report.deterministicStepCount).toBe(1);
    expect(report.estimatedDuration.sequentialMs).toBe(3001); // 1 LLM × 3s + 1 det × 1ms
  });

  it("extracts required tools", () => {
    const s = step("web").prompt("fetch").tools(["web_fetch", "email_send"]);
    const p = pipeline("tools-test").step(s);

    const report = analyze(p);
    expect(report.requiredTools).toContain("web_fetch");
    expect(report.requiredTools).toContain("email_send");
  });

  it("includes control flow steps in analysis", () => {
    const s = step("refine").prompt("improve");
    const loopDef = loop(s, () => false, { maxIterations: 5 });
    const p = pipeline("loop-analysis").loop(loopDef);

    const report = analyze(p);
    expect(report.controlFlowNodes).toBe(1);
    expect(report.llmStepCount).toBe(1); // loop contains 1 LLM step
  });

  it("includes branch steps in analysis", () => {
    const a = step("yes").prompt("yes");
    const b = step("no").prompt("no");
    const branchDef = branch(() => true, { true: a, false: b });
    const p = pipeline("branch-analysis").branch(branchDef);

    const report = analyze(p);
    expect(report.controlFlowNodes).toBe(1);
    expect(report.llmStepCount).toBe(2); // both branches analyzed
  });

  it("formats analysis as readable text", () => {
    const s = step("summarize").prompt("Summarize").output(z.object({ summary: z.string() })).retry({ maxAttempts: 3 });
    const p = pipeline("format-test").step(s);

    const text = formatAnalysis(analyze(p));

    expect(text).toContain("Pipeline: format-test");
    expect(text).toContain("Steps: 1");
    expect(text).toContain("Token estimate:");
    expect(text).toContain("Cost estimate:");
    expect(text).toContain("Time estimate:");
  });

  it("estimates higher cost for Opus vs Haiku", () => {
    const s = step("think").prompt("think deeply about this");
    const p = pipeline("cost-compare").step(s);

    const report = analyze(p);
    const opus = report.estimatedCost["claude-opus-4-6"];
    const haiku = report.estimatedCost["claude-haiku-4-5"];

    expect(opus.perRun).toBeGreaterThan(haiku.perRun);
  });
});
