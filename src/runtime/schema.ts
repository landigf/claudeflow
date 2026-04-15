import type { ZodType } from "zod";

export function zodToJsonSchema(schema: ZodType | unknown): Record<string, unknown> {
  const s = schema as {
    _def?: { typeName?: string; shape?: () => Record<string, unknown>; type?: unknown };
  };
  const typeName = s._def?.typeName;

  if (typeName === "ZodString") return { type: "string" };
  if (typeName === "ZodNumber") return { type: "number" };
  if (typeName === "ZodBoolean") return { type: "boolean" };

  if (typeName === "ZodObject") {
    const shape = s._def?.shape?.() ?? {};
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
    }
    return {
      type: "object",
      properties,
      required: Object.keys(shape),
      additionalProperties: false,
    };
  }

  if (typeName === "ZodArray") {
    const items = s._def?.type;
    return { type: "array", items: items ? zodToJsonSchema(items) : {} };
  }

  return { type: "string" };
}
