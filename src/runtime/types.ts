import type { ZodType } from "zod";

/**
 * Runtime is the abstraction over how LLM calls are executed.
 * Implementations: ClaudeCliRuntime (local), ClaudeApiRuntime (production), MockRuntime (testing).
 */
export interface Runtime {
  execute(request: RuntimeRequest): Promise<RuntimeResponse>;
}

export interface RuntimeRequest {
  /** The fully interpolated prompt */
  prompt: string;
  /** Optional system prompt */
  systemPrompt?: string;
  /** Zod schema for structured output extraction */
  outputSchema?: ZodType;
  /** Tools the step is allowed to use */
  tools?: string[];
  /** Timeout in ms */
  timeoutMs?: number;
  /** Model override */
  model?: string;
  /** Temperature (0-1) */
  temperature?: number;
}

export interface RuntimeResponse {
  /** Raw text response */
  text: string;
  /** Parsed structured output (if outputSchema was provided) */
  structured?: unknown;
  /** Token usage */
  usage: TokenUsage;
  /** Estimated cost in USD */
  costUsd: number | null;
  /** Wall-clock duration */
  durationMs: number;
  /** Model that was used */
  model: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}
