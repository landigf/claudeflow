import type { ZodType } from "zod";

export interface RetryConfig {
  maxAttempts: number;
  backoff?: "fixed" | "linear" | "exponential";
  baseDelayMs?: number;
}

export interface StepDef {
  readonly id: string;
  readonly inputSchema?: ZodType;
  readonly outputSchema?: ZodType;
  readonly promptTemplate?: string;
  readonly systemPrompt?: string;
  readonly tools?: string[];
  readonly retry?: RetryConfig;
  readonly timeoutMs?: number;
  readonly model?: string;
  readonly temperature?: number;
  readonly deterministic?: boolean;
  readonly fn?: (input: unknown) => unknown | Promise<unknown>;
  readonly fallback?: StepDef;
}

/**
 * Fluent builder for creating steps. Immutable — each method returns a new builder.
 *
 * Usage:
 *   step("summarize")
 *     .input(z.object({ url: z.string() }))
 *     .output(z.object({ title: z.string(), summary: z.string() }))
 *     .prompt("Summarize the content at {url}")
 *     .retry({ maxAttempts: 3 })
 */
class StepBuilderImpl {
  private readonly _def: StepDef;

  constructor(id: string, overrides?: Partial<StepDef>) {
    this._def = { id, ...overrides } as StepDef;
  }

  private with(overrides: Partial<StepDef>): StepBuilderImpl {
    return new StepBuilderImpl(this._def.id, { ...this._def, ...overrides });
  }

  input(schema: ZodType): StepBuilderImpl {
    return this.with({ inputSchema: schema });
  }

  output(schema: ZodType): StepBuilderImpl {
    return this.with({ outputSchema: schema });
  }

  prompt(template: string): StepBuilderImpl {
    return this.with({ promptTemplate: template });
  }

  system(prompt: string): StepBuilderImpl {
    return this.with({ systemPrompt: prompt });
  }

  tools(tools: string[]): StepBuilderImpl {
    return this.with({ tools });
  }

  retry(config: RetryConfig): StepBuilderImpl {
    return this.with({ retry: config });
  }

  timeout(ms: number): StepBuilderImpl {
    return this.with({ timeoutMs: ms });
  }

  useModel(model: string): StepBuilderImpl {
    return this.with({ model });
  }

  temp(temperature: number): StepBuilderImpl {
    return this.with({ temperature });
  }

  fn(fn: (input: unknown) => unknown | Promise<unknown>): StepBuilderImpl {
    return this.with({ deterministic: true, fn });
  }

  fallback(s: StepBuilderImpl | StepDef): StepBuilderImpl {
    const def = s instanceof StepBuilderImpl ? s.build() : s;
    return this.with({ fallback: def });
  }

  build(): StepDef {
    return { ...this._def };
  }
}

export type StepBuilder = StepBuilderImpl;

export function step(id: string): StepBuilderImpl {
  return new StepBuilderImpl(id);
}
