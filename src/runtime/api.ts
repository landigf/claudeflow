import type { Runtime, RuntimeRequest, RuntimeResponse } from "./types.js";

export interface ClaudeApiRuntimeOptions {
  /** Anthropic API key */
  apiKey: string;
  /** Model to use. Default: "claude-sonnet-4-20250514" */
  model?: string;
  /** Max output tokens. Default: 4096 */
  maxTokens?: number;
  /** Base URL for API. Default: "https://api.anthropic.com" */
  baseUrl?: string;
}

// Pricing per 1M tokens (USD)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};

/**
 * Runtime using the Anthropic API directly via fetch.
 * No SDK dependency — just HTTP calls. Works anywhere.
 *
 * Usage:
 *   const runtime = new ClaudeApiRuntime({ apiKey: process.env.ANTHROPIC_API_KEY! });
 *   const result = await myPipeline.run(input, { runtime });
 */
export class ClaudeApiRuntime implements Runtime {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #maxTokens: number;
  readonly #baseUrl: string;

  constructor(options: ClaudeApiRuntimeOptions) {
    if (!options.apiKey) {
      throw new Error("ClaudeApiRuntime requires an apiKey. Set ANTHROPIC_API_KEY env var.");
    }
    this.#apiKey = options.apiKey;
    this.#model = options.model ?? "claude-sonnet-4-20250514";
    this.#maxTokens = options.maxTokens ?? 4096;
    this.#baseUrl = options.baseUrl ?? "https://api.anthropic.com";
  }

  async execute(request: RuntimeRequest): Promise<RuntimeResponse> {
    const model = request.model ?? this.#model;
    const startMs = Date.now();

    // Build the prompt with schema instructions if needed
    let userContent = request.prompt;
    if (request.outputSchema) {
      userContent += "\n\nRespond with ONLY a valid JSON object. No markdown, no explanation.";
    }

    const body: Record<string, unknown> = {
      model,
      max_tokens: this.#maxTokens,
      messages: [{ role: "user", content: userContent }],
    };

    if (request.systemPrompt) {
      body.system = request.systemPrompt;
    }
    if (request.temperature != null) {
      body.temperature = request.temperature;
    }

    const controller = new AbortController();
    const timeout = request.timeoutMs
      ? setTimeout(() => controller.abort(), request.timeoutMs)
      : null;

    try {
      const response = await fetch(`${this.#baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.#apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`Anthropic API error (${response.status}): ${errorBody.slice(0, 200)}`);
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text?: string }>;
        usage: { input_tokens: number; output_tokens: number };
        model: string;
        stop_reason: string;
      };

      const text = data.content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");

      const durationMs = Date.now() - startMs;
      const inputTokens = data.usage?.input_tokens ?? 0;
      const outputTokens = data.usage?.output_tokens ?? 0;
      const pricing = PRICING[model] ?? PRICING["claude-sonnet-4-20250514"];
      const costUsd = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;

      // Try structured output parsing
      let structured: unknown;
      if (request.outputSchema) {
        try {
          const jsonStr = extractJsonObject(text);
          if (jsonStr) {
            structured = request.outputSchema.parse(JSON.parse(jsonStr));
          }
        } catch {
          // Schema validation failed — structured stays undefined
        }
      }

      return {
        text,
        structured,
        usage: { inputTokens, outputTokens },
        costUsd,
        durationMs,
        model: data.model ?? model,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
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
