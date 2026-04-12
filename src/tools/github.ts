import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolAdapter } from "./index.js";

const execFileAsync = promisify(execFile);

/**
 * GitHub tool — interact with GitHub via `gh` CLI.
 * No LLM needed — deterministic API calls.
 */
export class GitHubTool implements ToolAdapter {
  readonly name = "github";

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    switch (action) {
      case "get-issue":
        return this.#getIssue(params);
      case "create-issue":
        return this.#createIssue(params);
      case "search-issues":
        return this.#searchIssues(params);
      case "create-pr":
        return this.#createPr(params);
      case "list-repos":
        return this.#ghJson(["repo", "list", "--json", "name,nameWithOwner,description", "--limit", "30"]);
      default:
        throw new Error(`GitHubTool: unknown action "${action}"`);
    }
  }

  async #getIssue(params: Record<string, unknown>): Promise<unknown> {
    const repo = params.repo as string;
    const number = params.number as number;
    return this.#ghJson(["issue", "view", String(number), "--repo", repo, "--json", "title,body,labels,state,assignees"]);
  }

  async #createIssue(params: Record<string, unknown>): Promise<unknown> {
    const repo = params.repo as string;
    const title = params.title as string;
    const body = (params.body as string) ?? "";
    const labels = (params.labels as string[]) ?? [];

    const args = ["issue", "create", "--repo", repo, "--title", title, "--body", body];
    for (const label of labels) {
      args.push("--label", label);
    }

    const { stdout } = await execFileAsync("gh", args, { maxBuffer: 5 * 1024 * 1024 });
    return { url: stdout.trim() };
  }

  async #searchIssues(params: Record<string, unknown>): Promise<unknown> {
    const repo = params.repo as string;
    const query = params.query as string;
    return this.#ghJson(["issue", "list", "--repo", repo, "--search", query, "--json", "number,title,state", "--limit", "10"]);
  }

  async #createPr(params: Record<string, unknown>): Promise<unknown> {
    const repo = params.repo as string;
    const title = params.title as string;
    const body = (params.body as string) ?? "";
    const base = (params.base as string) ?? "main";

    const args = ["pr", "create", "--repo", repo, "--title", title, "--body", body, "--base", base];
    const { stdout } = await execFileAsync("gh", args, { maxBuffer: 5 * 1024 * 1024 });
    return { url: stdout.trim() };
  }

  async #ghJson(args: string[]): Promise<unknown> {
    const { stdout } = await execFileAsync("gh", args, { maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(stdout);
  }
}
