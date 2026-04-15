import type { ToolAdapter } from "./index.js";

/**
 * DSPy-style prompt optimization adapter.
 *
 * Instead of requiring the full DSPy Python library, this implements
 * the core optimization pattern directly: given a prompt + eval function,
 * iteratively improve the prompt using the LLM itself as the optimizer.
 *
 * Usage in pipeline:
 *   - id: optimize-prompt
 *     tool: dspy
 *     action: optimize
 *     params:
 *       prompt: "Current prompt text to optimize"
 *       evalCommand: "python eval.py --prompt-file prompt.txt"
 *       metricPattern: "accuracy: (\\d+\\.\\d+)"
 *       iterations: 5
 */
export class DspyTool implements ToolAdapter {
  readonly name = "dspy";

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    switch (action) {
      case "optimize":
        return this.#optimize(params);
      case "bootstrap":
        return this.#bootstrap(params);
      default:
        throw new Error(`DspyTool: unknown action "${action}". Supported: "optimize", "bootstrap"`);
    }
  }

  /**
   * Optimize a prompt by iterating: run eval → analyze errors → rewrite prompt → repeat.
   * This is the core DSPy pattern without requiring Python.
   */
  async #optimize(params: Record<string, unknown>): Promise<unknown> {
    const prompt = params.prompt as string;
    const evalCommand = params.evalCommand as string;
    const metricPattern = params.metricPattern as string;
    const iterations = (params.iterations as number) ?? 5;

    if (!prompt) throw new Error("DspyTool.optimize: prompt is required");
    if (!evalCommand) throw new Error("DspyTool.optimize: evalCommand is required");

    // Return the configuration for the optimize loop to use
    // The actual optimization is done by ClaudeFlow's optimize primitive
    return {
      type: "optimization_config",
      prompt,
      evalCommand,
      metricPattern,
      iterations,
      strategy: "iterative_refinement",
      description:
        "Use ClaudeFlow's optimize() loop with this config: mutate step rewrites the prompt, eval step runs the evalCommand and extracts the metric.",
    };
  }

  /**
   * Bootstrap few-shot examples by running the prompt on sample inputs
   * and collecting successful outputs as demonstrations.
   */
  async #bootstrap(params: Record<string, unknown>): Promise<unknown> {
    const prompt = params.prompt as string;
    const examples = params.examples as Array<{ input: string; expectedOutput?: string }>;

    if (!prompt) throw new Error("DspyTool.bootstrap: prompt is required");
    if (!examples || !Array.isArray(examples))
      throw new Error("DspyTool.bootstrap: examples array is required");

    return {
      type: "bootstrap_config",
      prompt,
      exampleCount: examples.length,
      examples,
      strategy: "collect_demonstrations",
      description:
        "Run the prompt on each example input, keep outputs that match expected patterns, use successful (input, output) pairs as few-shot demonstrations in the optimized prompt.",
    };
  }
}
