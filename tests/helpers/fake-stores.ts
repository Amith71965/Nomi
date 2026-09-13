import type { MemoryRow, TurnRow } from "@/lib/schemas/db";
import { InMemoryMemoryStore } from "@/lib/memory/store";
import { InMemoryTurnStore } from "@/lib/turns/store";

/** Module-level singletons so a vi.mock factory and the test body share one store. */
export const memoryStore = new InMemoryMemoryStore();
export const turnStore = new InMemoryTurnStore();

export const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const CONVERSATION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export function makeMemoryRow(overrides: Partial<MemoryRow> & { id: string; user_id: string }): MemoryRow {
  return {
    category: "inventory",
    entity_key: "tomato",
    entity: "Tomatoes",
    value: { availability: "out" },
    status: "active",
    confidence: 0.95,
    source: "text",
    source_quote: "I'm out of tomatoes",
    source_turn_id: null,
    version: 1,
    expires_at: null,
    created_at: "2026-09-11T18:00:00+00:00",
    updated_at: "2026-09-11T18:00:00+00:00",
    ...overrides,
  };
}

export function makeTurnRow(overrides: Partial<TurnRow> & { id: string; user_id: string }): TurnRow {
  return {
    conversation_id: CONVERSATION,
    client_request_id: overrides.id,
    input_text: "hello",
    input_kind: "text",
    include_in_context: true,
    status: "completed",
    response: null,
    evidence: [],
    error_code: null,
    created_at: "2026-09-11T18:00:00+00:00",
    updated_at: "2026-09-11T18:00:00+00:00",
    ...overrides,
  };
}
