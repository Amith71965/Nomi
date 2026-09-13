import { z } from "zod";
import {
  dataModeSchema,
  httpUrlSchema,
  inputKindSchema,
  inputTextSchema,
  isoDateTimeSchema,
  timeZoneSchema,
  uuidSchema,
  versionSchema,
} from "@/lib/schemas/common";
import { memoryViewSchema } from "@/lib/schemas/memory";
import { calendarDraftSchema } from "@/lib/schemas/actions";

export const UI_BLOCKS_MAX = 2;
export const SUGGESTED_ACTIONS_MAX = 4;
export const PRODUCTS_PER_ITEM_MAX = 3;

// ── Research ────────────────────────────────────────────────────────────────

export const evidenceSchema = z.object({
  sourceUrl: httpUrlSchema,
  sourceName: z.string().min(1).max(120),
  retrievedAt: isoDateTimeSchema,
  mode: dataModeSchema,
});

export const productSchema = z.object({
  id: z.string().min(1).max(120),
  itemKey: z.string().min(1).max(160),
  title: z.string().min(1).max(300),
  imageUrl: httpUrlSchema.nullable(),
  merchant: z.string().max(120),
  priceAmount: z.number().nonnegative().nullable(),
  currency: z.literal("USD").nullable(),
  unitLabel: z.string().max(60).nullable(),
  normalizedPricePerKg: z.number().positive().nullable(),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.int().nonnegative().nullable(),
  availability: z.enum(["in_stock", "out_of_stock", "unknown"]),
  fulfillment: z.enum(["pickup", "delivery", "both", "unknown"]),
  distanceKm: z.number().nonnegative().nullable(),
  deliveryMinutes: z.number().nonnegative().nullable(),
  destinationUrl: httpUrlSchema,
  destinationKind: z.enum(["merchant", "search_listing"]),
  reason: z.string().max(400),
  score: z.number().min(0).max(100).nullable(),
  scoreCoverage: z.number().min(0).max(1),
  evidence: evidenceSchema,
});

// ── The five UI blocks ──────────────────────────────────────────────────────

export const memoryUpdateUISchema = z.object({
  type: z.literal("memory_update"),
  data: z.object({
    changes: z
      .array(z.object({ operation: z.enum(["created", "updated"]), memory: memoryViewSchema }))
      .max(30),
  }),
});

export const shoppingResultsUISchema = z.object({
  type: z.literal("shopping_results"),
  data: z.object({
    searchId: uuidSchema,
    selectedItemKey: z.string().min(1),
    items: z.array(z.object({ key: z.string().min(1), label: z.string().min(1) })).min(1).max(6),
    products: z.array(productSchema).max(PRODUCTS_PER_ITEM_MAX * 2),
    notice: z.string().max(300).nullable(),
  }),
});

export const decisionCardUISchema = z.object({
  type: z.literal("decision_card"),
  data: z.object({
    title: z.string().min(1).max(160),
    confirmedNeeds: z.array(z.string()).max(20),
    suggestionsToCheck: z.array(z.string()).max(20),
    otherInterests: z.array(z.string()).max(20),
    recommendedProductId: z.string().nullable(),
    reasons: z.array(z.string().max(300)).max(6),
    limitations: z.array(z.string().max(300)).max(6),
  }),
});

export const approvalCardUISchema = z.object({
  type: z.literal("approval_card"),
  data: z.object({
    actionId: uuidSchema,
    version: versionSchema,
    kind: z.literal("calendar.create"),
    level: z.literal(2),
    expiresAt: isoDateTimeSchema,
    status: z.enum(["proposed", "executing", "cancelled", "expired", "failed", "unknown"]),
    preview: calendarDraftSchema,
  }),
});

export const calendarConfirmationUISchema = z.object({
  type: z.literal("calendar_confirmation"),
  data: z.object({
    actionId: uuidSchema,
    eventId: z.string().min(5),
    eventUrl: httpUrlSchema,
    event: calendarDraftSchema,
    verifiedAt: isoDateTimeSchema,
    mode: z.literal("live"),
  }),
});

export const uiBlockSchema = z.discriminatedUnion("type", [
  memoryUpdateUISchema,
  shoppingResultsUISchema,
  decisionCardUISchema,
  approvalCardUISchema,
  calendarConfirmationUISchema,
]);
export type UIBlockInput = z.infer<typeof uiBlockSchema>;

export const UI_BLOCK_TYPES = [
  "memory_update",
  "shopping_results",
  "decision_card",
  "approval_card",
  "calendar_confirmation",
] as const;

// ── Suggested actions ───────────────────────────────────────────────────────

export const suggestedIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("research_groceries") }),
  z.object({ kind: z.literal("show_item"), itemKey: z.string().min(1), searchId: uuidSchema }),
  z.object({ kind: z.literal("sort_results"), searchId: uuidSchema, sort: z.enum(["value", "price"]) }),
  z.object({ kind: z.literal("review_curry_ingredients") }),
  z.object({ kind: z.literal("schedule_grocery_run"), sourceTurnId: uuidSchema }),
  z.object({ kind: z.literal("open_memory") }),
]);

export const SUGGESTED_INTENT_KINDS = [
  "research_groceries",
  "show_item",
  "sort_results",
  "review_curry_ingredients",
  "schedule_grocery_run",
  "open_memory",
] as const;

export const suggestedActionSchema = z.object({
  id: uuidSchema,
  label: z.string().min(1).max(40),
  intent: suggestedIntentSchema,
});

// ── Assistant response (wire) ───────────────────────────────────────────────

export const assistantResponseSchema = z
  .object({
    schemaVersion: z.literal("1"),
    turnId: uuidSchema,
    message: z.string().min(1).max(4000),
    speak: z.string().max(600).nullable(),
    memory_updates: z.array(memoryViewSchema).max(30),
    ui: z.array(uiBlockSchema).max(UI_BLOCKS_MAX),
    suggested_actions: z.array(suggestedActionSchema).max(SUGGESTED_ACTIONS_MAX),
    requested_action: z.object({ id: uuidSchema, version: versionSchema }).nullable(),
  })
  .refine(
    (r) => {
      // requested_action must reference the approval card in the same response.
      if (!r.requested_action) return true;
      return r.ui.some(
        (b) =>
          b.type === "approval_card" &&
          b.data.actionId === r.requested_action?.id &&
          b.data.version === r.requested_action.version,
      );
    },
    { message: "requested_action_must_match_approval_card" },
  );
export type AssistantResponseInput = z.infer<typeof assistantResponseSchema>;

// ── Assistant request (wire) ────────────────────────────────────────────────

export const assistantTextRequestSchema = z.strictObject({
  clientRequestId: uuidSchema,
  conversationId: uuidSchema,
  text: inputTextSchema,
  inputKind: inputKindSchema.exclude(["suggestion"]),
  timeZone: timeZoneSchema,
});

export const assistantSuggestionRequestSchema = z.strictObject({
  clientRequestId: uuidSchema,
  conversationId: uuidSchema,
  sourceTurnId: uuidSchema,
  suggestionId: uuidSchema,
  timeZone: timeZoneSchema,
});

export const assistantRequestSchema = z.union([assistantTextRequestSchema, assistantSuggestionRequestSchema]);
export type AssistantRequestInput = z.infer<typeof assistantRequestSchema>;

// ── Model answer (what the model is allowed to say; server builds the rest) ─

export const REASON_CODES = [
  "lowest_unit_price",
  "highest_rated",
  "closest",
  "fastest_delivery",
  "most_complete_listing",
  "matches_confirmed_need",
  "no_comparable_prices",
  "missing_unit_size",
  "limited_evidence",
] as const;

export const modelAnswerSchema = z.strictObject({
  message: z.string().min(1).max(1200),
  speak: z.string().max(400).nullable(),
  clarifying_question: z.string().max(300).nullable(),
  selected_product_ids: z.array(z.string().max(120)).max(3),
  reason_codes: z.array(z.enum(REASON_CODES)).max(4),
  suggested_intent_names: z.array(z.enum(SUGGESTED_INTENT_KINDS)).max(SUGGESTED_ACTIONS_MAX),
  decision: z
    .strictObject({
      title: z.string().min(1).max(160),
      confirmed_need_keys: z.array(z.string().max(160)).max(20),
      suggestion_keys: z.array(z.string().max(160)).max(20),
      other_interest_keys: z.array(z.string().max(160)).max(20),
      limitations: z.array(z.string().max(300)).max(6),
    })
    .nullable(),
});
export type ModelAnswer = z.infer<typeof modelAnswerSchema>;
