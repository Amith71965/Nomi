import { describe, expect, it } from "vitest";
import fixtures from "@/fixtures/ui-responses.json";
import type { AssistantResponse, UIBlock } from "@/types/contracts";
import {
  SUGGESTED_ACTIONS_MAX,
  UI_BLOCKS_MAX,
  UI_BLOCK_TYPES,
  assistantRequestSchema,
  assistantResponseSchema,
  modelAnswerSchema,
  uiBlockSchema,
} from "@/lib/schemas/assistant";
import { memoryDeleteRequestSchema, memoryPatchRequestSchema, memoryValueSchemaFor } from "@/lib/schemas/memory";
import { actionPatchRequestSchema, calendarDraftSchema } from "@/lib/schemas/actions";
import { FORBIDDEN_TOOL_NAMES, TOOL_NAMES, toolDefinitions } from "@/lib/schemas/tools";

describe("UI block fixtures", () => {
  it("every fixture block validates and there are exactly five types", () => {
    expect(UI_BLOCK_TYPES).toHaveLength(5);
    for (const type of UI_BLOCK_TYPES) {
      const block = fixtures.blocks[type];
      const parsed = uiBlockSchema.parse(block);
      const typed: UIBlock = parsed; // compile-time: schema output is assignable to the contract
      expect(typed.type).toBe(type);
    }
  });

  it("rejects an unknown block type (no dynamic components from model data)", () => {
    expect(uiBlockSchema.safeParse({ type: "raw_html", data: { html: "<b>x</b>" } }).success).toBe(false);
  });

  it("calendar_confirmation must be live; a fixture-mode confirmation is invalid", () => {
    const c = structuredClone(fixtures.blocks.calendar_confirmation);
    (c.data as { mode: string }).mode = "fixture";
    expect(uiBlockSchema.safeParse(c).success).toBe(false);
  });

  it("product with a null price is valid; a negative price is not", () => {
    const s = structuredClone(fixtures.blocks.shopping_results);
    expect(uiBlockSchema.safeParse(s).success).toBe(true);
    s.data.products[0]!.priceAmount = -1;
    expect(uiBlockSchema.safeParse(s).success).toBe(false);
  });
});

describe("AssistantResponse", () => {
  it("fixture responses validate and are assignable to the contract type", () => {
    for (const r of Object.values(fixtures.responses)) {
      const parsed = assistantResponseSchema.parse(r);
      const typed: AssistantResponse = parsed;
      expect(typed.schemaVersion).toBe("1");
    }
  });

  it("caps ui blocks at 2 and suggested actions at 4", () => {
    const base = fixtures.responses.four_fact_turn;
    const tooManyBlocks = { ...base, ui: Array(UI_BLOCKS_MAX + 1).fill(fixtures.blocks.decision_card) };
    expect(assistantResponseSchema.safeParse(tooManyBlocks).success).toBe(false);
    const chip = base.suggested_actions[0];
    const tooManyChips = { ...base, suggested_actions: Array(SUGGESTED_ACTIONS_MAX + 1).fill(chip) };
    expect(assistantResponseSchema.safeParse(tooManyChips).success).toBe(false);
  });

  it("requested_action must reference the approval card in the same response", () => {
    const src = fixtures.responses.schedule_turn;
    const staleVersion = { ...src, requested_action: { id: src.requested_action.id, version: 99 } };
    expect(assistantResponseSchema.safeParse(staleVersion).success).toBe(false);
    const wrongId = { ...src, requested_action: { id: "00000000-0000-4000-8000-000000000000", version: 1 } };
    expect(assistantResponseSchema.safeParse(wrongId).success).toBe(false);
    const none = { ...src, requested_action: null };
    expect(assistantResponseSchema.safeParse(none).success).toBe(true);
  });
});

describe("AssistantRequest", () => {
  const ids = { clientRequestId: "0a1b2c3d-4e5f-4a6b-8c7d-9e8f7a6b5c4d", conversationId: "0a1b2c3d-4e5f-4a6b-8c7d-9e8f7a6b5c4e" };

  it("accepts exactly one input form", () => {
    expect(assistantRequestSchema.safeParse({ ...ids, text: "hi", inputKind: "text", timeZone: "America/New_York" }).success).toBe(true);
    expect(
      assistantRequestSchema.safeParse({ ...ids, sourceTurnId: ids.conversationId, suggestionId: ids.clientRequestId, timeZone: "UTC" }).success,
    ).toBe(true);
    // Both forms at once is malformed.
    expect(
      assistantRequestSchema.safeParse({ ...ids, text: "hi", inputKind: "text", sourceTurnId: ids.conversationId, suggestionId: ids.clientRequestId, timeZone: "UTC" })
        .success,
    ).toBe(false);
  });

  it("rejects suggestion as a text inputKind, bad timezones, and 4001-char text", () => {
    expect(assistantRequestSchema.safeParse({ ...ids, text: "hi", inputKind: "suggestion", timeZone: "UTC" }).success).toBe(false);
    expect(assistantRequestSchema.safeParse({ ...ids, text: "hi", inputKind: "text", timeZone: "+05:30" }).success).toBe(false);
    expect(assistantRequestSchema.safeParse({ ...ids, text: "x".repeat(4001), inputKind: "text", timeZone: "UTC" }).success).toBe(false);
  });

  it("never accepts a client-supplied user id", () => {
    expect(assistantRequestSchema.safeParse({ ...ids, text: "hi", inputKind: "text", timeZone: "UTC", userId: "x" }).success).toBe(false);
  });
});

describe("memory and action request schemas", () => {
  it("delete requires confirmed:true and a version", () => {
    expect(memoryDeleteRequestSchema.safeParse({ version: 1, confirmed: true }).success).toBe(true);
    expect(memoryDeleteRequestSchema.safeParse({ version: 1, confirmed: false }).success).toBe(false);
    expect(memoryDeleteRequestSchema.safeParse({ confirmed: true }).success).toBe(false);
  });

  it("patch needs at least one field besides version", () => {
    expect(memoryPatchRequestSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(memoryPatchRequestSchema.safeParse({ version: 1, status: "completed" }).success).toBe(true);
  });

  it("typed memory values reject unknown keys", () => {
    expect(memoryValueSchemaFor("inventory").safeParse({ availability: "out" }).success).toBe(true);
    expect(memoryValueSchemaFor("inventory").safeParse({ availability: "out", qty: 3 }).success).toBe(false);
    expect(memoryValueSchemaFor("plan").safeParse({ meal: "chicken curry", local_date: "2026-09-11" }).success).toBe(true);
  });

  it("calendar draft requires RFC3339 offsets and a valid zone", () => {
    const ok = fixtures.blocks.approval_card.data.preview;
    expect(calendarDraftSchema.safeParse(ok).success).toBe(true);
    expect(calendarDraftSchema.safeParse({ ...ok, startAt: "2026-09-11T17:30:00" }).success).toBe(false);
    expect(calendarDraftSchema.safeParse({ ...ok, timeZone: "EST" }).success).toBe(false);
  });

  it("action patch needs a version and at least one field", () => {
    expect(actionPatchRequestSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(actionPatchRequestSchema.safeParse({ version: 1, title: "New" }).success).toBe(true);
    expect(actionPatchRequestSchema.safeParse({ version: 1, status: "succeeded" }).success).toBe(false); // client cannot set status
  });
});

describe("ModelAnswer", () => {
  it("accepts a small strict answer and rejects extra fields", () => {
    const ok = {
      message: "Tomatoes and potatoes are confirmed needs.",
      speak: null,
      clarifying_question: null,
      selected_product_ids: [],
      reason_codes: ["matches_confirmed_need"],
      suggested_intent_names: ["research_groceries"],
      decision: null,
    };
    expect(modelAnswerSchema.safeParse(ok).success).toBe(true);
    expect(modelAnswerSchema.safeParse({ ...ok, price: 3.99 }).success).toBe(false);
    expect(modelAnswerSchema.safeParse({ ...ok, suggested_intent_names: ["create_calendar_event"] }).success).toBe(false);
  });
});

describe("tool definitions", () => {
  it("exposes exactly the six allowed tools and never the executor", () => {
    const defs = toolDefinitions();
    expect(defs.map((d) => d.function.name)).toEqual([...TOOL_NAMES]);
    for (const forbidden of FORBIDDEN_TOOL_NAMES) {
      expect(defs.some((d) => (d.function.name as string) === forbidden)).toBe(false);
    }
  });

  it("every tool schema is strict: additionalProperties false and all properties required", () => {
    for (const def of toolDefinitions()) {
      const p = def.function.parameters as { type: string; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
      expect(def.function.strict).toBe(true);
      expect(p.type).toBe("object");
      expect(p.additionalProperties).toBe(false);
      expect(new Set(p.required)).toEqual(new Set(Object.keys(p.properties)));
    }
  });

  it("tool arguments never include a user_id, url, or token field", () => {
    const text = JSON.stringify(toolDefinitions());
    for (const banned of ['"user_id"', '"url"', '"token"', '"sql"', '"calendar_token"']) {
      expect(text).not.toContain(banned);
    }
  });
});
