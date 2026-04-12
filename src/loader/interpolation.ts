/**
 * Simple {variable} interpolation for prompt templates.
 * Supports dot notation: {step.field} and nested access.
 */
export function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (match, key: string) => {
    const value = resolve(key.trim(), vars);
    if (value === undefined) return match;
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  });
}

function resolve(path: string, obj: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
