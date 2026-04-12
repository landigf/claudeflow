import { spawn } from "node:child_process";
import os from "node:os";
import type { Runtime, RuntimeRequest, RuntimeResponse } from "./types.js";

export interface ClaudeCliRuntimeOptions {
  /** Path to claude CLI binary. Default: "claude" */
  command?: string;
  /** Working directory for claude. Default: process.cwd() */
  cwd?: string;
  /** Default timeout in ms. Default: 120_000 (2 minutes) */
  defaultTimeoutMs?: number;
  /** Permission mode. Default: "plan" (read-only tools) */
  permissionMode?: "plan" | "bypassPermissions";
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

  constructor(options?: ClaudeCliRuntimeOptions) {
    this.#command = options?.command ?? "claude";
    this.#cwd = options?.cwd ?? process.cwd();
    this.#defaultTimeoutMs = options?.defaultTimeoutMs ?? 120_000;
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

    // Build the full prompt with system prompt if provided
    const fullPrompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    // If output schema is provided, append schema instructions
    const promptWithSchema = request.outputSchema
      ? `${fullPrompt}\n\nRespond with ONLY a JSON object matching this schema, no other text:\n${JSON.stringify(zodToJsonSchema(request.outputSchema), null, 2)}`
      : fullPrompt;

    const raw = await this.#spawn(args, promptWithSchema, timeoutMs);
    const durationMs = Date.now() - startMs;

    // Parse the CLI JSON response
    let parsed: ClaudeCliJsonResponse;
    try {
      parsed = JSON.parse(raw) as ClaudeCliJsonResponse;
    } catch {
      // If JSON parse fails, treat raw output as plain text
      return {
        text: raw.trim(),
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: null,
        durationMs,
        model: "unknown",
      };
    }

    if (parsed.is_error) {
      throw new Error(`Claude CLI error: ${parsed.result}`);
    }

    // Extract model name from model_usage keys
    const model = parsed.model_usage
      ? Object.keys(parsed.model_usage)[0] ?? "unknown"
      : "unknown";

    // Try to parse structured output if schema was requested
    let structured: unknown;
    if (request.outputSchema) {
      try {
        const jsonMatch = parsed.result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          structured = request.outputSchema.parse(JSON.parse(jsonMatch[0]));
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
