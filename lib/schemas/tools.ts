import { z } from "zod";
import { categorySchema } from "@/lib/schemas/common";
import { toModelJsonSchema } from "@/lib/schemas/json-schema";

/**
 * Tool argument schemas exposed to the model. The tool contract never accepts
 * user_id, SQL, a provider URL, or a Calendar token. The Calendar executor is
 * deliberately absent: the model can only PROPOSE.
 *
 * Strict-mode rules for OpenAI-compatible tools: every property required,
 * `additionalProperties: false`, nullable instead of optional.
 */

export const getMemoriesArgsSchema = z.strictObject({
  categories: z.array(categorySchema).max(5),
  entity_keys: z.array(z.string().max(160)).max(30),
  limit: z.int().min(1).max(30),
});

const memoryEntryValueSchema = z.strictObject({
  availability: z.enum(["out", "low", "available"]).nullable(),
  meal: z.string().max(120).nullable(),
  local_date: z.string().max(10).nullable(),
  intent: z.enum(["research", "buy", "do"]).nullable(),
  group: z.string().max(60).nullable(),
  note: z.string().max(200).nullable(),
});

export const createMemoryArgsSchema = z.strictObject({
  entries: z
    .array(
      z.strictObject({
        category: categorySchema,
        entity: z.string().min(1).max(200),
        entity_key: z.string().min(1).max(160),
        value: memoryEntryValueSchema,
        quote: z.string().min(1).max(400),
        confidence: z.number().min(0).max(1),
        expires_at: z.string().nullable(),
      }),
    )
    .min(1)
    .max(8),
});

export const updateMemoryArgsSchema = z.strictObject({
  entries: z
    .array(
      z.strictObject({
        id: z.string().uuid(),
        expected_version: z.int().positive(),
        value: memoryEntryValueSchema.nullable(),
        status: z.enum(["active", "completed", "cancelled"]).nullable(),
        quote: z.string().min(1).max(400),
      }),
    )
    .min(1)
    .max(8),
});

export const searchProductsArgsSchema = z.strictObject({
  items: z
    .array(z.strictObject({ item_key: z.string().min(1).max(160), query: z.string().min(1).max(120) }))
    .min(1)
    .max(2),
  currency: z.literal("USD"),
  max_results_per_item: z.int().min(1).max(3),
});

export const compareOptionsArgsSchema = z.strictObject({
  search_id: z.string().uuid(),
  item_key: z.string().min(1).max(160),
  result_ids: z.array(z.string().max(120)).min(1).max(6),
  profile: z.enum(["general", "groceries", "fashion"]),
  sort: z.enum(["value", "price"]),
});

export const proposeCalendarEventArgsSchema = z.strictObject({
  title: z.string().min(1).max(200),
  start_at: z.string().max(40).nullable(),
  end_at: z.string().max(40).nullable(),
  time_zone: z.string().max(64),
  description: z.string().max(2000),
  location: z.string().max(300).nullable(),
});

export const TOOL_NAMES = [
  "get_memories",
  "create_memory",
  "update_memory",
  "search_products",
  "compare_options",
  "propose_calendar_event",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const toolArgSchemas = {
  get_memories: getMemoriesArgsSchema,
  create_memory: createMemoryArgsSchema,
  update_memory: updateMemoryArgsSchema,
  search_products: searchProductsArgsSchema,
  compare_options: compareOptionsArgsSchema,
  propose_calendar_event: proposeCalendarEventArgsSchema,
} as const;

const TOOL_DESCRIPTIONS: Readonly<Record<ToolName, string>> = {
  get_memories: "Read the current user's active, unexpired memories. Empty arrays mean no extra filter.",
  create_memory:
    "Save explicit facts the user just stated. Each entry needs the exact supporting quote. Never save suggestions, questions, or inferred pantry state.",
  update_memory:
    "Correct or complete an existing memory the user just addressed (e.g. 'I bought potatoes'). Requires the expected version.",
  search_products: "Search grocery listings for up to two items. Returns normalized evidence records with nullable fields.",
  compare_options: "Rank stored search results for one item. Result IDs must come from a search in this turn.",
  propose_calendar_event:
    "Ask the user to approve a calendar event. This never creates the event; it produces an approval card.",
};

export interface ChatToolDefinition {
  type: "function";
  function: {
    name: ToolName;
    description: string;
    strict: true;
    parameters: Record<string, unknown>;
  };
}

/** OpenAI Chat Completions tool definitions (works through OpenRouter). */
export function toolDefinitions(names: readonly ToolName[] = TOOL_NAMES): ChatToolDefinition[] {
  return names.map((name) => ({
    type: "function",
    function: {
      name,
      description: TOOL_DESCRIPTIONS[name],
      strict: true,
      parameters: toModelJsonSchema(toolArgSchemas[name]),
    },
  }));
}

/** Guard: the executor must never be exposed. */
export const FORBIDDEN_TOOL_NAMES = ["create_calendar_event", "create_shopping_list", "update_note", "find_nearby_places"] as const;
