import type { PipelineTrace, StepTrace } from "./trace.js";

/**
 * Convert a PipelineTrace to OpenTelemetry-compatible OTLP JSON spans.
 * Can be sent to any OTLP collector (Langfuse, Jaeger, Grafana Tempo, etc.)
 *
 * Usage:
 *   const spans = traceToOtlp(result.trace);
 *   await fetch("http://localhost:4318/v1/traces", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify(spans),
 *   });
 *
 * Or save to file for import:
 *   writeFileSync("trace.otlp.json", JSON.stringify(spans, null, 2));
 */
export function traceToOtlp(trace: PipelineTrace): OtlpExportRequest {
  const traceId = hexId(16);
  const rootSpanId = hexId(8);

  const rootSpan: OtlpSpan = {
    traceId,
    spanId: rootSpanId,
    parentSpanId: "",
    name: `pipeline:${trace.pipelineName}`,
    kind: 1, // SPAN_KIND_INTERNAL
    startTimeUnixNano: dateToNano(trace.startedAt),
    endTimeUnixNano: dateToNano(trace.finishedAt),
    status: { code: trace.status === "completed" ? 1 : 2 }, // OK or ERROR
    attributes: [
      attr("claudeflow.pipeline.name", trace.pipelineName),
      attr("claudeflow.pipeline.status", trace.status),
      attr("claudeflow.pipeline.run_id", trace.runId),
      attr("claudeflow.tokens.input", trace.totalTokens.inputTokens),
      attr("claudeflow.tokens.output", trace.totalTokens.outputTokens),
      attr("claudeflow.cost.usd", trace.totalCostUsd),
      attr("claudeflow.duration.ms", trace.totalDurationMs),
      attr("claudeflow.steps.count", trace.steps.length),
    ],
  };

  const stepSpans: OtlpSpan[] = trace.steps.map((step) => {
    const stepSpanId = hexId(8);
    const startNano =
      dateToNano(trace.startedAt) + BigInt(sumDurationBefore(trace.steps, step) * 1_000_000);
    const endNano = startNano + BigInt(step.durationMs * 1_000_000);

    const span: OtlpSpan = {
      traceId,
      spanId: stepSpanId,
      parentSpanId: rootSpanId,
      name: `step:${step.stepId}`,
      kind: 1,
      startTimeUnixNano: startNano,
      endTimeUnixNano: endNano,
      status: { code: step.status === "completed" ? 1 : 2 },
      attributes: [
        attr("claudeflow.step.id", step.stepId),
        attr("claudeflow.step.name", step.stepName),
        attr("claudeflow.step.status", step.status),
        attr("claudeflow.step.duration_ms", step.durationMs),
        attr("claudeflow.step.attempts", step.attempts.length),
        ...step.attempts.flatMap((a, i) => [
          attr(`claudeflow.attempt.${i}.tokens_in`, a.usage.inputTokens),
          attr(`claudeflow.attempt.${i}.tokens_out`, a.usage.outputTokens),
          attr(`claudeflow.attempt.${i}.cost_usd`, a.costUsd ?? 0),
          attr(`claudeflow.attempt.${i}.duration_ms`, a.durationMs),
        ]),
      ],
    };

    return span;
  });

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [attr("service.name", "claudeflow"), attr("service.version", "0.1.0")],
        },
        scopeSpans: [
          {
            scope: { name: "claudeflow", version: "0.1.0" },
            spans: [rootSpan, ...stepSpans],
          },
        ],
      },
    ],
  };
}

/**
 * Send OTLP trace to a collector endpoint.
 */
export async function exportToOtlp(
  trace: PipelineTrace,
  endpoint: string,
  headers?: Record<string, string>,
): Promise<{ ok: boolean; status: number }> {
  const otlp = traceToOtlp(trace);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(otlp),
  });
  return { ok: response.ok, status: response.status };
}

// ── OTLP types (minimal, matches OTLP JSON spec) ──────────────────────────

interface OtlpExportRequest {
  resourceSpans: Array<{
    resource: { attributes: OtlpAttribute[] };
    scopeSpans: Array<{
      scope: { name: string; version: string };
      spans: OtlpSpan[];
    }>;
  }>;
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string;
  name: string;
  kind: number;
  startTimeUnixNano: bigint;
  endTimeUnixNano: bigint;
  status: { code: number };
  attributes: OtlpAttribute[];
}

interface OtlpAttribute {
  key: string;
  value: { stringValue?: string; intValue?: number; doubleValue?: number };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function hexId(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function dateToNano(date: Date): bigint {
  return BigInt(date.getTime()) * 1_000_000n;
}

function attr(key: string, value: string | number): OtlpAttribute {
  if (typeof value === "string") {
    return { key, value: { stringValue: value } };
  }
  if (Number.isInteger(value)) {
    return { key, value: { intValue: value } };
  }
  return { key, value: { doubleValue: value } };
}

function sumDurationBefore(steps: StepTrace[], target: StepTrace): number {
  let total = 0;
  for (const s of steps) {
    if (s === target) break;
    total += s.durationMs;
  }
  return total;
}
