/**
 * Tool adapters — thin wrappers around external tools.
 * Deterministic (no LLM), instant, zero tokens.
 */

export interface ToolAdapter {
  readonly name: string;
  execute(action: string, params: Record<string, unknown>): Promise<unknown>;
}

export { ShellTool } from "./shell.js";
export { GitHubTool } from "./github.js";
export { FileTool } from "./file.js";
export { EvalTool } from "./eval.js";

import { ShellTool } from "./shell.js";
import { GitHubTool } from "./github.js";
import { FileTool } from "./file.js";
import { EvalTool } from "./eval.js";

/** Create a registry of built-in tools */
export function createToolRegistry(): Map<string, ToolAdapter> {
  const registry = new Map<string, ToolAdapter>();
  registry.set("shell", new ShellTool());
  registry.set("github", new GitHubTool());
  registry.set("file", new FileTool());
  registry.set("eval", new EvalTool());
  return registry;
}
