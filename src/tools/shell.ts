import { spawn } from "node:child_process";
import type { ToolAdapter } from "./index.js";

/**
 * Shell tool — execute local commands.
 * Used for: tests, builds, git, deploy, any CLI tool.
 */
export class ShellTool implements ToolAdapter {
  readonly name = "shell";

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    if (action !== "run") {
      throw new Error(`ShellTool: unknown action "${action}". Supported: "run"`);
    }

    const command = params.command as string;
    if (!command) throw new Error("ShellTool: command is required");

    const cwd = (params.cwd as string) ?? process.cwd();
    const timeout = (params.timeout as number) ?? 60_000;

    return new Promise((resolve) => {
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
        resolve({ stdout, stderr, exitCode: -1, timedOut: true });
      }, timeout);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? -1,
          timedOut: false,
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ stdout: "", stderr: err.message, exitCode: -1, timedOut: false });
      });
    });
  }
}
