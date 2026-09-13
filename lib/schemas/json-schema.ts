import { z } from "zod";

/**
 * JSON Schema for the model, derived from the same Zod schemas the server
 * validates with. Strict-mode providers reject many constraint keywords, so
 * they are stripped here; Zod enforces them after the model responds.
 */
const STRIP_KEYWORDS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "pattern",
  "format",
  "default",
  "examples",
]);

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node === null || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (STRIP_KEYWORDS.has(key)) continue;
    out[key] = sanitize(value);
  }
  if (out.type === "object" && typeof out.properties === "object" && out.properties !== null) {
    // Strict mode: every property required, no extras.
    out.required = Object.keys(out.properties as Record<string, unknown>);
    out.additionalProperties = false;
  }
  return out;
}

export function toModelJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: "draft-7" });
  return sanitize(raw) as Record<string, unknown>;
}

/** True when no stripped keyword survives anywhere in the tree (used by tests). */
export function containsUnsupportedKeyword(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = containsUnsupportedKeyword(item);
      if (hit) return hit;
    }
    return null;
  }
  if (node === null || typeof node !== "object") return null;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (STRIP_KEYWORDS.has(key)) return key;
    const hit = containsUnsupportedKeyword(value);
    if (hit) return hit;
  }
  return null;
}
