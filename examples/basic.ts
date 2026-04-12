/**
 * Basic ClaudeFlow example — a two-step pipeline with MockRuntime.
 *
 * Run: npx tsx examples/basic.ts
 */
import { step, pipeline, z, MockRuntime } from "../src/index.js";

// Step 1: Summarize a URL
const summarize = step("summarize")
  .input(z.object({ url: z.string() }))
  .output(z.object({ title: z.string(), summary: z.string(), wordCount: z.number() }))
  .prompt("Fetch and summarize the content at {url}. Return title, summary, and word count.");

// Step 2: Classify the summary
const classify = step("classify")
  .output(z.object({ category: z.string(), confidence: z.number() }))
  .prompt("Classify this summary into a category (tech/science/business/other): {summarize.summary}");

// Compose into a pipeline
const digestPipeline = pipeline("content-digest").step(summarize).step(classify);

// Run with mock (for demo — swap MockRuntime with ClaudeCliRuntime for real execution)
const mock = new MockRuntime({
  summarize: { title: "ClaudeFlow Launch", summary: "A new tool for composable AI pipelines", wordCount: 150 },
  classify: { category: "tech", confidence: 0.92 },
});

const result = await digestPipeline.run({ url: "https://example.com" }, { runtime: mock, verbose: true });
console.log("\nOutput:", result.output);
console.log("Trace:", JSON.stringify(result.trace, null, 2).slice(0, 500));
