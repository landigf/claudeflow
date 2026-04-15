import { zodToJsonSchema } from "./schema.js";
import type { Runtime, RuntimeRequest, RuntimeResponse } from "./types.js";

export interface OpenAICompatibleRuntimeOptions {
  /** API key. Optional for local OpenAI-compatible servers such as Ollama. */
  apiKey?: string;
  /** Model to use. Default: "gpt-5-mini" */
  model?: string;
  /** Max output tokens. Default: 4096 */
  maxTokens?: number;
  /** Base URL for the OpenAI-compatible API. Default: "https://api.openai.com/v1" */
  baseUrl?: string;
  /** Optional extra headers for providers that need them. */
  defaultHeaders?: Record<string, string>;
}

interface OpenAIChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

// Pricing per 1M tokens (USD) for selected OpenAI and Gemini models.
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.4": { input: 2.5, output: 15.0 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
  "gpt-5": { input: 1.25, output: 10.0 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
};

/**
 * Runtime for OpenAI's Chat Completions API and compatible providers.
 * Works with OpenAI, Ollama, LM Studio, and any server that implements the
 * `/chat/completions` contract.
 */
export class OpenAICompatibleRuntime implements Runtime {
  readonly #apiKey?: string;
  readonly #model: string;
  readonly #maxTokens: number;
  readonly #baseUrl: string;
  readonly #defaultHeaders: Record<string, string>;

  constructor(options?: OpenAICompatibleRuntimeOptions) {
    this.#apiKey = options?.apiKey;
    this.#model = options?.model ?? "gpt-5-mini";
    this.#maxTokens = options?.maxTokens ?? 4096;
    this.#baseUrl = (options?.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.#defaultHeaders = options?.defaultHeaders ?? {};
  }

  async execute(request: RuntimeRequest): Promise<RuntimeResponse> {
    const model = request.model ?? this.#model;
    const startMs = Date.now();

    let userContent = request.prompt;
    if (request.outputSchema) {
      userContent += `\n\nRespond with ONLY a JSON object matching this schema, no other text:\n${JSON.stringify(zodToJsonSchema(request.outputSchema), null, 2)}`;
    }

    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: userContent });

    const body: Record<string, unknown> = {
      model,
      messages,
    };

    if (usesOpenAiMaxCompletionTokens(model, this.#baseUrl)) {
      body.max_completion_tokens = this.#maxTokens;
    } else {
      body.max_tokens = this.#maxTokens;
    }

    if (request.temperature != null) {
      body.temperature = request.temperature;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.#defaultHeaders,
    };
    if (this.#apiKey) {
      headers.Authorization = `Bearer ${this.#apiKey}`;
    }

    const controller = new AbortController();
    const timeout = request.timeoutMs
      ? setTimeout(() => controller.abort(), request.timeoutMs)
      : null;

    try {
      const response = await fetch(`${this.#baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(
          `OpenAI-compatible API error (${response.status}): ${errorBody.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as OpenAIChatCompletionResponse;
      const text = extractMessageText(data.choices?.[0]?.message?.content);
      const durationMs = Date.now() - startMs;
      const inputTokens = data.usage?.prompt_tokens ?? 0;
      const outputTokens = data.usage?.completion_tokens ?? 0;
      const pricing = PRICING[model];
      const costUsd = pricing
        ? (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
        : null;

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
        usage: {
          inputTokens,
          outputTokens,
          cacheReadTokens: data.usage?.prompt_tokens_details?.cached_tokens,
        },
        costUsd,
        durationMs,
        model: data.model ?? model,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

function usesOpenAiMaxCompletionTokens(model: string, baseUrl: string): boolean {
  return baseUrl.includes("api.openai.com") && model.startsWith("gpt-5");
}

function extractMessageText(
  content: string | Array<{ type?: string; text?: string }> | undefined,
): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content.map((part) => part.text ?? "").join("");
}

/** Extract the first balanced JSON object from a string. */
function extractJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}
