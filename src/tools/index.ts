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
export { PromptfooTool } from "./promptfoo.js";
export { DspyTool } from "./dspy.js";
export { WebTool } from "./web.js";

import { DspyTool } from "./dspy.js";
import { EvalTool } from "./eval.js";
import { FileTool } from "./file.js";
import { GitHubTool } from "./github.js";
import { PromptfooTool } from "./promptfoo.js";
import { ShellTool } from "./shell.js";
import { WebTool } from "./web.js";

/** Create a registry of all built-in tools */
export function createToolRegistry(): Map<string, ToolAdapter> {
  const registry = new Map<string, ToolAdapter>();
  registry.set("shell", new ShellTool());
  registry.set("github", new GitHubTool());
  registry.set("file", new FileTool());
  registry.set("eval", new EvalTool());
  registry.set("promptfoo", new PromptfooTool());
  registry.set("dspy", new DspyTool());
  registry.set("web", new WebTool());
  return registry;
}
