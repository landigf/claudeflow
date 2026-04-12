import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { step } from "../core/step.js";
import { PipelineDef } from "../core/pipeline.js";
import { loop } from "../control/loop.js";
import { branch } from "../control/branch.js";
import { map } from "../control/map.js";
import type { StepDef, RetryConfig } from "../core/step.js";
import type { Context } from "../core/context.js";

// ── YAML Schema ─────────────────────────────────────────────────────────────

interface YamlPipeline {
  name: string;
  description?: string;
  version?: string;
  steps: YamlStep[];
}

interface YamlStep {
  id: string;
  prompt?: string;
  system?: string;
  input?: Record<string, YamlSchemaField>;
  output?: Record<string, YamlSchemaField>;
  tools?: string[];
  retry?: { maxAttempts: number; backoff?: string; baseDelayMs?: number };
  timeout?: number;
  model?: string;
  temperature?: number;
  // Control flow
  loop?: { condition: string; maxIterations: number };
  branch?: { condition: string; true: YamlStep; false: YamlStep };
  map?: string; // dot-path to array in context
  concurrency?: number;
}

type YamlSchemaField =
  | string // shorthand: "string", "number", "boolean"
  | { type: string; items?: YamlSchemaField; enum?: string[]; format?: string };

// ── Parser ──────────────────────────────────────────────────────────────────

/**
 * Load a pipeline from a YAML file.
 *
 * Usage:
 *   const pipeline = loadYaml("pipelines/my-pipeline.yaml");
 *   const result = await pipeline.run(input, { runtime });
 */
export function loadYaml(filePath: string): PipelineDef {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read pipeline file "${filePath}": ${(error as Error).message}`);
  }
  return parseYamlString(raw);
}

/**
 * Parse a pipeline from a YAML string.
 */
export function parseYamlString(yamlContent: string): PipelineDef {
  const doc = parseYaml(yamlContent) as YamlPipeline;
  if (!doc.name) throw new Error("YAML pipeline must have a 'name' field");
  if (!doc.steps || !Array.isArray(doc.steps)) throw new Error("YAML pipeline must have a 'steps' array");

  let pipeline = new PipelineDef(doc.name);

  for (const yamlStep of doc.steps) {
    if (!yamlStep.id) throw new Error("Each step must have an 'id' field");

    // Map step
    if (yamlStep.map) {
      const innerStep = buildStepDef(yamlStep);
      const mapDef = map(yamlStep.map, innerStep, { concurrency: yamlStep.concurrency });
      pipeline = pipeline.map(mapDef);
      continue;
    }

    // Loop step
    if (yamlStep.loop) {
      const innerStep = buildStepDef(yamlStep);
      const condition = buildCondition(yamlStep.loop.condition);
      const loopDef = loop(innerStep, condition, { maxIterations: yamlStep.loop.maxIterations });
      pipeline = pipeline.loop(loopDef);
      continue;
    }

    // Branch step
    if (yamlStep.branch) {
      const condition = buildCondition(yamlStep.branch.condition);
      const trueBranch = buildStepDef(yamlStep.branch.true);
      const falseBranch = buildStepDef(yamlStep.branch.false);
      const branchDef = branch(condition, { true: trueBranch, false: falseBranch });
      pipeline = pipeline.branch(branchDef);
      continue;
    }

    // Regular step
    pipeline = pipeline.step(buildStepDef(yamlStep));
  }

  return pipeline;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildStepDef(yamlStep: YamlStep): StepDef {
  let builder = step(yamlStep.id);

  if (yamlStep.prompt) builder = builder.prompt(yamlStep.prompt);
  if (yamlStep.system) builder = builder.system(yamlStep.system);
  if (yamlStep.tools) builder = builder.tools(yamlStep.tools);
  if (yamlStep.timeout) builder = builder.timeout(yamlStep.timeout);
  if (yamlStep.model) builder = builder.useModel(yamlStep.model);
  if (yamlStep.temperature != null) builder = builder.temp(yamlStep.temperature);

  if (yamlStep.input) {
    builder = builder.input(buildZodSchema(yamlStep.input));
  }
  if (yamlStep.output) {
    builder = builder.output(buildZodSchema(yamlStep.output));
  }
  if (yamlStep.retry) {
    const retry: RetryConfig = {
      maxAttempts: yamlStep.retry.maxAttempts,
      backoff: (yamlStep.retry.backoff as RetryConfig["backoff"]) ?? "fixed",
      baseDelayMs: yamlStep.retry.baseDelayMs,
    };
    builder = builder.retry(retry);
  }

  return builder.build();
}

function buildZodSchema(fields: Record<string, YamlSchemaField>): z.ZodType {
  const shape: Record<string, z.ZodType> = {};

  for (const [key, field] of Object.entries(fields)) {
    shape[key] = fieldToZod(field);
  }

  return z.object(shape);
}

function fieldToZod(field: YamlSchemaField): z.ZodType {
  if (typeof field === "string") {
    return primitiveToZod(field);
  }

  if (field.type === "array" && field.items) {
    return z.array(fieldToZod(field.items));
  }

  if (field.type === "object" && typeof field === "object" && !field.enum) {
    // Nested object — treat remaining keys as fields
    const entries = Object.entries(field).filter(([k]) => k !== "type");
    if (entries.length > 0) {
      const shape: Record<string, z.ZodType> = {};
      for (const [k, v] of entries) {
        shape[k] = fieldToZod(v as YamlSchemaField);
      }
      return z.object(shape);
    }
    return z.record(z.unknown());
  }

  if (field.enum) {
    const values = field.enum;
    if (values.length === 0) return z.string();
    return z.enum(values as [string, ...string[]]);
  }

  return primitiveToZod(field.type);
}

function primitiveToZod(type: string): z.ZodType {
  switch (type) {
    case "string": return z.string();
    case "number": return z.number();
    case "boolean": return z.boolean();
    default: return z.unknown();
  }
}

/**
 * Build a condition function from a simple expression string.
 * Supports: "field.path > 0.8", "field.path == true", "field.path != null"
 */
function buildCondition(expr: string): (ctx: Context) => boolean {
  // Parse "path operator value" expressions
  const match = expr.match(/^([\w.]+)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
  if (!match) {
    // Fallback: treat as a truthy check on a path
    return (ctx) => {
      const val = resolvePath(expr.trim(), { ...ctx.input as Record<string, unknown>, ...ctx.state });
      return Boolean(val);
    };
  }

  const [, path, op, rawValue] = match;
  const value = parseValue(rawValue.trim());

  return (ctx) => {
    const allVars = { ...(ctx.input as Record<string, unknown>), ...ctx.state };
    const actual = resolvePath(path, allVars);
    switch (op) {
      case ">": return Number(actual) > Number(value);
      case "<": return Number(actual) < Number(value);
      case ">=": return Number(actual) >= Number(value);
      case "<=": return Number(actual) <= Number(value);
      case "==": return actual === value;
      case "!=": return actual !== value;
      default: return false;
    }
  };
}

function parseValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  const num = Number(raw);
  if (!Number.isNaN(num)) return num;
  return raw.replace(/^["']|["']$/g, "");
}

function resolvePath(path: string, obj: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
