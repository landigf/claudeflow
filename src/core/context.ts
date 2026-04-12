/**
 * Context is the typed state bag that flows between pipeline steps.
 * Immutable — each step gets a frozen snapshot and produces new output.
 */
export interface Context<TInput = unknown> {
  /** Original pipeline input */
  readonly input: TInput;
  /** Accumulated step outputs, keyed by step ID */
  readonly state: Record<string, unknown>;
  /** Run metadata */
  readonly meta: ContextMeta;
}

export interface ContextMeta {
  readonly runId: string;
  readonly pipelineName: string;
  readonly startedAt: Date;
  readonly stepIndex: number;
  readonly parentRunId?: string;
}

export function createContext<TInput>(
  input: TInput,
  runId: string,
  pipelineName: string,
): Context<TInput> {
  return Object.freeze({
    input,
    state: Object.freeze({}),
    meta: Object.freeze({
      runId,
      pipelineName,
      startedAt: new Date(),
      stepIndex: 0,
    }),
  });
}

export function advanceContext<TInput>(
  ctx: Context<TInput>,
  stepId: string,
  output: unknown,
): Context<TInput> {
  return Object.freeze({
    input: ctx.input,
    state: Object.freeze({ ...ctx.state, [stepId]: output }),
    meta: Object.freeze({
      ...ctx.meta,
      stepIndex: ctx.meta.stepIndex + 1,
    }),
  });
}
