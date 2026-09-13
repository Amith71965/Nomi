import { describe, expect, it } from "vitest";
import type { ActionView, AssistantResponse, TurnView, UIBlock } from "@/types/contracts";
import { entriesFromTurns, initialState, overlayAction, reduce } from "@/components/assistant/reducer";

const CONV = "11111111-1111-4111-8111-111111111111";
const TURN = "22222222-2222-4222-8222-222222222222";
const ACTION = "33333333-3333-4333-8333-333333333333";

const response: AssistantResponse = {
  schemaVersion: "1",
  turnId: TURN,
  message: "Saved.",
  speak: null,
  memory_updates: [],
  ui: [],
  suggested_actions: [],
  requested_action: null,
};

const request = { clientRequestId: "44444444-4444-4444-8444-444444444444", conversationId: CONV, text: "hi", inputKind: "text" as const, timeZone: "UTC" };

describe("conversation reducer", () => {
  it("keeps the same clientRequestId for a retry and refuses a second send while pending", () => {
    let s = reduce(initialState(CONV), { type: "send", request, label: "hi" });
    expect(s.pending?.request.clientRequestId).toBe(request.clientRequestId);
    const again = reduce(s, { type: "send", request: { ...request, clientRequestId: "55555555-5555-4555-8555-555555555555" }, label: "again" });
    expect(again).toBe(s);
    s = reduce(s, { type: "failed", message: "timeout", retryable: true });
    const err = s.entries.at(-1);
    expect(err?.kind).toBe("error");
    expect(err?.kind === "error" && err.request?.clientRequestId).toBe(request.clientRequestId);
    expect(s.pending).toBeNull();
  });

  it("appends the assistant response and clears pending", () => {
    const s = reduce(reduce(initialState(CONV), { type: "send", request, label: "hi" }), { type: "received", response });
    expect(s.pending).toBeNull();
    expect(s.entries.map((e) => e.kind)).toEqual(["user", "assistant"]);
  });

  it("rebuilds entries from stored turns, marking suggestions and failures honestly", () => {
    const turns: TurnView[] = [
      { id: TURN, conversationId: CONV, inputText: "hello", inputKind: "text", status: "completed", response, errorCode: null, createdAt: "2026-09-13T12:00:00.000Z" },
      { id: ACTION, conversationId: CONV, inputText: "[suggestion] Groceries", inputKind: "suggestion", status: "failed", response: null, errorCode: "deadline_exceeded", createdAt: "2026-09-13T12:01:00.000Z" },
    ];
    const entries = entriesFromTurns(turns);
    expect(entries.map((e) => e.kind)).toEqual(["user", "assistant", "user", "error"]);
    expect(entries[2]).toMatchObject({ text: "Groceries", suggestion: true });
    expect(entries[3]).toMatchObject({ retryable: false });
    expect(entries[3].kind === "error" && entries[3].message).toMatch(/too long/);
  });

  it("a new conversation keeps memories but drops entries", () => {
    let s = reduce(initialState(CONV), { type: "received", response });
    s = reduce(s, { type: "memories_loaded", memories: [] });
    s = reduce(s, { type: "new_conversation", conversationId: "66666666-6666-4666-8666-666666666666" });
    expect(s.entries).toEqual([]);
    expect(s.conversationId).toBe("66666666-6666-4666-8666-666666666666");
  });
});

describe("overlayAction", () => {
  const preview = { title: "Grocery run", startAt: "2026-09-13T17:30:00-04:00", endAt: "2026-09-13T18:00:00-04:00", timeZone: "America/New_York", calendarLabel: "Primary calendar", location: null, description: "" };
  const card: UIBlock = { type: "approval_card", data: { actionId: ACTION, version: 1, kind: "calendar.create", level: 2, expiresAt: "2026-09-13T17:00:00-04:00", status: "proposed", preview } };
  const base: ActionView = { id: ACTION, version: 2, kind: "calendar.create", level: 2, status: "proposed", expiresAt: "2026-09-13T17:00:00-04:00", preview, eventId: null, eventUrl: null, executedAt: null, errorCode: null };

  it("leaves the card alone without live state and follows version and status when there is", () => {
    expect(overlayAction(card, {})).toBe(card);
    const changed = overlayAction(card, { [ACTION]: { ...base, status: "cancelled" } });
    expect(changed.type === "approval_card" && changed.data).toMatchObject({ version: 2, status: "cancelled" });
  });

  it("shows a live confirmation only for a succeeded action with a real event id and link", () => {
    const done = overlayAction(card, { [ACTION]: { ...base, status: "succeeded", eventId: "abc12", eventUrl: "https://calendar.google.com/event?eid=x", executedAt: "2026-09-13T17:01:00-04:00" } });
    expect(done.type).toBe("calendar_confirmation");
    const halfDone = overlayAction(card, { [ACTION]: { ...base, status: "succeeded", eventId: null, eventUrl: null, executedAt: null } });
    expect(halfDone.type === "approval_card" && halfDone.data.status).toBe("unknown");
  });
});
