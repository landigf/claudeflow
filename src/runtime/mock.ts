import type { Runtime, RuntimeRequest, RuntimeResponse } from "./types.js";

/**
 * MockRuntime returns deterministic responses for testing.
 * Responses are keyed by step ID (extracted from the prompt or provided directly).
 */
export class MockRuntime implements Runtime {
  readonly #responses: Record<string, unknown>;
  readonly #calls: RuntimeRequest[] = [];

  constructor(responses: Record<string, unknown>) {
    this.#responses = responses;
  }

  get calls(): readonly RuntimeRequest[] {
    return this.#calls;
  }

  async execute(request: RuntimeRequest): Promise<RuntimeResponse> {
    this.#calls.push(request);

    // Find a matching response — check each key against the prompt
    let output: unknown = null;
    for (const [key, value] of Object.entries(this.#responses)) {
      if (request.prompt.includes(key) || key === "*") {
        output = value;
        break;
      }
    }

    // If no match by prompt content, use the first unused response
    if (output === null) {
      const keys = Object.keys(this.#responses);
      const index = Math.min(this.#calls.length - 1, keys.length - 1);
      output = this.#responses[keys[index]] ?? {};
    }

    const text = typeof output === "string" ? output : JSON.stringify(output);

    return {
      text,
      structured: typeof output === "object" ? output : undefined,
      usage: { inputTokens: 0, outputTokens: 0 },
      costUsd: 0,
      durationMs: 1,
      model: request.model ?? "mock",
    };
  }

  /** Create a MockRuntime from recorded snapshot fixtures */
  static fromSnapshot(fixtures: Record<string, { response: string; structured?: unknown }>): MockRuntime {
    const responses: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fixtures)) {
      responses[key] = value.structured ?? value.response;
    }
    return new MockRuntime(responses);
  }
}
