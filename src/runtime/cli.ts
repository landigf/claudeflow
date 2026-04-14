import { spawn } from "node:child_process";
import os from "node:os";
import type { Runtime, RuntimeRequest, RuntimeResponse } from "./types.js";

export interface ClaudeCliRuntimeOptions {
  /** Path to claude CLI binary. Default: "claude" */
  command?: string;
  /** Working directory for claude. Default: process.cwd() */
  cwd?: string;
  /**
   * Default wrapper timeout in ms. Default: 120_000 (2 minutes).
   * This is enforced by ClaudeFlow around each CLI invocation; it is not a guarantee
   * that Claude Code itself can run indefinitely if you raise it.
   */
  defaultTimeoutMs?: number;
  /** Permission mode. Default: "plan" (read-only tools) */
  permissionMode?: "plan" | "bypassPermissions";
  /** Max turns per invocation. Prevents runaway loops. */
  maxTurns?: number;
  /** Max budget in USD per invocation. Stops if exceeded. */
  maxBudgetUsd?: number;
  /** MCP config file path for external tool access. */
  mcpConfig?: string;
}

interface ClaudeCliJsonResponse {
  type: string;
  subtype?: string;
  is_error: boolean;
  result: string;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model_usage?: Record<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens?: number;
      costUSD?: number;
    }
  >;
}

/**
 * Runtime that spawns the `claude` CLI for each step.
 * Free with Claude Max subscription. Best for local dev and prototyping.
 *
 * Usage:
 *   const runtime = new ClaudeCliRuntime({ cwd: "/path/to/project" });
 *   const result = await runtime.execute({ prompt: "..." });
 */
export class ClaudeCliRuntime implements Runtime {
  readonly #command: string;
  readonly #cwd: string;
  readonly #defaultTimeoutMs: number;
  readonly #permissionMode: string;
  readonly #maxTurns?: number;
  readonly #maxBudgetUsd?: number;
  readonly #mcpConfig?: string;

  constructor(options?: ClaudeCliRuntimeOptions) {
    this.#command = options?.command ?? "claude";
    this.#cwd = options?.cwd ?? process.cwd();
    this.#defaultTimeoutMs = options?.defaultTimeoutMs ?? 120_000;
    this.#maxTurns = options?.maxTurns;
    this.#maxBudgetUsd = options?.maxBudgetUsd;
    this.#mcpConfig = options?.mcpConfig;
    this.#permissionMode = options?.permissionMode ?? "plan";
  }

  async execute(request: RuntimeRequest): Promise<RuntimeResponse> {
    const timeoutMs = request.timeoutMs ?? this.#defaultTimeoutMs;
    const startMs = Date.now();

    // Build args: -p (print mode), - (stdin), --output-format json
    const args = ["-p", "-", "--output-format", "json"];
    if (this.#permissionMode) {
      args.push("--permission-mode", this.#permissionMode);
    }
    if (request.model) {
      args.push("--model", request.model);
    }
    if (request.tools?.length) {
      args.push("--allowedTools", request.tools.join(","));
    }
    if (this.#maxTurns) {
      args.push("--max-turns", String(this.#maxTurns));
    }
    if (this.#maxBudgetUsd) {
      args.push("--max-budget-usd", String(this.#maxBudgetUsd));
    }
    if (this.#mcpConfig) {
      args.push("--mcp-config", this.#mcpConfig);
    }

    // Pass system prompt via --system-prompt flag (not concatenated into user prompt)
    // This prevents Claude from confusing system instructions with user content.
    // Always include a safety guardrail so the response text is non-empty even in
    // plan mode / when the step has no explicit system prompt.
    const DEFAULT_SAFETY = "Provide your complete response as plain text in the response body. Do not write files or create artifacts as a substitute for returning text. If tools are allowed you may inspect or modify files when that materially helps, but you must still return the final deliverable in your response.";
    const systemPrompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${DEFAULT_SAFETY}`
      : DEFAULT_SAFETY;
    args.push("--system-prompt", systemPrompt);

    // Build the user prompt
    let userPrompt = request.prompt;

    // If output schema is provided, append schema instructions to user prompt
    if (request.outputSchema) {
      userPrompt += `\n\nRespond with ONLY a JSON object matching this schema, no other text:\n${JSON.stringify(zodToJsonSchema(request.outputSchema), null, 2)}`;
    }

    const raw = await this.#spawn(args, userPrompt, timeoutMs);
    const durationMs = Date.now() - startMs;

    // Parse the CLI JSON response
    let parsed: ClaudeCliJsonResponse;
    try {
      parsed = JSON.parse(raw) as ClaudeCliJsonResponse;
    } catch {
      // If JSON parse fails, treat raw output as plain text.
      // Best-effort regex extraction of token counts so we don't silently
      // lose usage accounting on malformed CLI output.
      const inMatch = raw.match(/"input_tokens"\s*:\s*(\d+)/);
      const outMatch = raw.match(/"output_tokens"\s*:\s*(\d+)/);
      return {
        text: raw.trim(),
        usage: {
          inputTokens: inMatch ? parseInt(inMatch[1], 10) : 0,
          outputTokens: outMatch ? parseInt(outMatch[1], 10) : 0,
        },
        costUsd: null,
        durationMs,
        model: "unknown",
      };
    }

    if (parsed.is_error) {
      throw new Error(`Claude CLI error: ${parsed.result}`);
    }

    // Detect empty results — Claude sometimes writes to files instead of returning output
    if (!parsed.result || parsed.result.trim().length === 0) {
      console.warn(`[claudeflow] WARNING: Claude returned empty result. This usually means it wrote to a file instead of returning text. Adding --system-prompt flag should prevent this.`);
    }

    // Extract model name from model_usage keys
    const model = parsed.model_usage
      ? Object.keys(parsed.model_usage)[0] ?? "unknown"
      : "unknown";

    // Try to parse structured output if schema was requested
    let structured: unknown;
    if (request.outputSchema) {
      try {
        const jsonStr = extractJsonObject(parsed.result);
        if (jsonStr) {
          structured = request.outputSchema.parse(JSON.parse(jsonStr));
        }
      } catch {
        // Schema validation failed — structured remains undefined
      }
    }

    return {
      text: parsed.result,
      structured,
      usage: {
        inputTokens: parsed.usage?.input_tokens ?? 0,
        outputTokens: parsed.usage?.output_tokens ?? 0,
        cacheReadTokens: parsed.usage?.cache_read_input_tokens,
      },
      costUsd: parsed.total_cost_usd ?? null,
      durationMs,
      model,
    };
  }

  #spawn(args: string[], prompt: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.#command, args, {
        cwd: this.#cwd,
        env: {
          ...process.env,
          HOME: process.env.HOME ?? os.homedir(),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      child.stdin.write(prompt);
      child.stdin.end();

      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Claude CLI timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 300)}`));
          return;
        }
        resolve(stdout);
      });
    });
  }
}

/**
 * Minimal Zod → JSON Schema conversion for output schema instructions.
 * Only handles the common cases needed for prompt engineering.
 */
function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  // Zod schemas have a _def property with shape info
  const def = (schema as { _def?: { typeName?: string; shape?: () => Record<string, unknown> } })._def;
  if (!def) return { type: "object" };

  if (def.typeName === "ZodObject" && def.shape) {
    const shape = def.shape();
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
    }
    return { type: "object", properties };
  }

  if (def.typeName === "ZodString") return { type: "string" };
  if (def.typeName === "ZodNumber") return { type: "number" };
  if (def.typeName === "ZodBoolean") return { type: "boolean" };
  if (def.typeName === "ZodArray") {
    const items = (def as { type?: unknown }).type;
    return { type: "array", items: items ? zodToJsonSchema(items) : {} };
  }

  return { type: "string" };
}

/** Extract the first balanced JSON object from a string. */
function extractJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return undefined;
}
