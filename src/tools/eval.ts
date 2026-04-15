import { spawn } from "node:child_process";
import type { ToolAdapter } from "./index.js";

/**
 * Eval tool — run a command and extract a metric from the output.
 * The autoresearch pattern: run experiment, measure result.
 */
export class EvalTool implements ToolAdapter {
  readonly name = "eval";

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    if (action !== "run") {
      throw new Error(`EvalTool: unknown action "${action}". Supported: "run"`);
    }

    const command = params.command as string;
    if (!command) throw new Error("EvalTool: command is required");

    const cwd = (params.cwd as string) ?? process.cwd();
    const timeout = (params.timeout as number) ?? 300_000;
    const extractMetric = params.extractMetric as string | undefined;

    const startMs = Date.now();

    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
      (resolve) => {
        const shell = process.platform === "darwin" ? "/bin/zsh" : "/bin/bash";
        const child = spawn(shell, ["-c", command], {
          cwd,
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({ stdout, stderr: `${stderr}\n(timed out)`, exitCode: -1 });
        }, timeout);

        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: code ?? -1 });
        });

        child.on("error", (err) => {
          clearTimeout(timer);
          resolve({ stdout: "", stderr: err.message, exitCode: -1 });
        });
      },
    );

    const durationMs = Date.now() - startMs;

    // Extract metric from output if pattern provided
    let metric: number | null = null;
    if (extractMetric && result.exitCode === 0) {
      const regex = new RegExp(extractMetric);
      const match = result.stdout.match(regex) ?? result.stderr.match(regex);
      if (match?.[1]) {
        metric = Number.parseFloat(match[1]);
      }
    }

    return {
      metric,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      exitCode: result.exitCode,
      durationMs,
      success: result.exitCode === 0,
    };
  }
}
