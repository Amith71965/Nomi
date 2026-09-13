import type { UIBlock, UIBlockType } from "@/types/contracts";
import { UI_BLOCK_TYPES, uiBlockSchema } from "@/lib/schemas/assistant";

/**
 * The only way model-selected content becomes UI: validate, then map to one of
 * five local components. Never a dynamic import, never HTML from the model.
 */
export type ResolvedBlock =
  | { kind: "block"; block: UIBlock }
  | { kind: "unknown"; type: string | null; reason: "unknown_type" | "invalid_data" };

export function isKnownBlockType(type: string): type is UIBlockType {
  return (UI_BLOCK_TYPES as readonly string[]).includes(type);
}

export function resolveBlock(input: unknown): ResolvedBlock {
  const result = uiBlockSchema.safeParse(input);
  if (result.success) return { kind: "block", block: result.data };
  const type =
    typeof input === "object" && input !== null && "type" in input && typeof (input as { type: unknown }).type === "string"
      ? (input as { type: string }).type
      : null;
  return { kind: "unknown", type, reason: type !== null && isKnownBlockType(type) ? "invalid_data" : "unknown_type" };
}
