import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ToolAdapter } from "./index.js";

/**
 * File tool — read, write, list, search files.
 * Deterministic, no LLM needed.
 */
export class FileTool implements ToolAdapter {
  readonly name = "file";

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    switch (action) {
      case "read":
        return this.#read(params);
      case "write":
        return this.#write(params);
      case "exists":
        return { exists: existsSync(params.path as string) };
      case "list":
        return this.#list(params);
      default:
        throw new Error(`FileTool: unknown action "${action}"`);
    }
  }

  #read(params: Record<string, unknown>): { content: string; size: number } {
    const filePath = params.path as string;
    const content = readFileSync(filePath, "utf-8");
    return { content, size: content.length };
  }

  #write(params: Record<string, unknown>): { path: string; written: boolean } {
    const filePath = params.path as string;
    const content = params.content as string;
    writeFileSync(filePath, content);
    return { path: filePath, written: true };
  }

  #list(params: Record<string, unknown>): { files: string[] } {
    const dir = params.path as string;
    const pattern = params.pattern as string | undefined;
    const entries = readdirSync(dir, { recursive: true }) as string[];
    const files = entries
      .filter((e) => {
        const full = path.join(dir, e);
        try {
          return statSync(full).isFile();
        } catch {
          return false;
        }
      })
      .filter((e) => !pattern || e.match(new RegExp(pattern)));
    return { files };
  }
}
