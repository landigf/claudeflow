import { spawn } from "node:child_process";
import type { ToolAdapter } from "./index.js";

/**
 * Promptfoo adapter — systematic prompt testing and evaluation.
 * Calls `promptfoo eval` CLI for prompt quality measurement.
 * Install: npm install -g promptfoo
 *
 * Usage in pipeline:
 *   - id: eval-prompts
 *     tool: promptfoo
 *     action: eval
 *     params:
 *       config: promptfooconfig.yaml
 */
export class PromptfooTool implements ToolAdapter {
  readonly name = "promptfoo";

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    switch (action) {
      case "eval":
        return this.#runEval(params);
      case "compare":
        return this.#runCompare(params);
      default:
        throw new Error(`PromptfooTool: unknown action "${action}". Supported: "eval", "compare"`);
    }
  }

  async #runEval(params: Record<string, unknown>): Promise<unknown> {
    const config = (params.config as string) ?? "promptfooconfig.yaml";
    const output = (params.output as string) ?? "json";
    const timeout = (params.timeout as number) ?? 300_000;

    const args = ["eval", "--config", config, "--output", `results.${output}`];
    if (output === "json") {
      args.push("--output-format", "json");
    }

    return this.#spawn("promptfoo", args, timeout);
  }

  async #runCompare(params: Record<string, unknown>): Promise<unknown> {
    // Compare two prompt configurations
    const configA = params.configA as string;
    const configB = params.configB as string;
    const timeout = (params.timeout as number) ?? 300_000;

    const resultA = await this.#spawn("promptfoo", ["eval", "--config", configA, "--output-format", "json"], timeout);
    const resultB = await this.#spawn("promptfoo", ["eval", "--config", configB, "--output-format", "json"], timeout);

    return {
      configA: { config: configA, result: resultA },
      configB: { config: configB, result: resultB },
    };
  }

  #spawn(command: string, args: string[], timeout: number): Promise<{ stdout: string; stderr: string; exitCode: number; success: boolean }> {
    return new Promise((resolve) => {
      let hasCommand = true;
      const child = spawn(command, args, {
        cwd: process.cwd(),
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        resolve({ stdout, stderr: stderr + "\n(timed out)", exitCode: -1, success: false });
      }, timeout);

      child.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
      child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });

      child.on("error", (err) => {
        clearTimeout(timer);
        hasCommand = false;
        resolve({
          stdout: "",
          stderr: `promptfoo not installed. Install with: npm install -g promptfoo\nError: ${err.message}`,
          exitCode: -1,
          success: false,
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (hasCommand) {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? -1, success: code === 0 });
        }
      });
    });
  }
}
