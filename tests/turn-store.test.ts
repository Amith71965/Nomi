import { describe, expect, it } from "vitest";
import { InMemoryTurnStore } from "@/lib/turns/store";
import { CONVERSATION, USER_A } from "./helpers/fake-stores";

const REQ = (n: number) => `2222222${n}-2222-4222-8222-222222222222`;

describe("InMemoryTurnStore (mirrors begin_turn RPC)", () => {
  it("is idempotent on client request id", async () => {
    const store = new InMemoryTurnStore();
    const a = await store.begin(USER_A, { conversationId: CONVERSATION, clientRequestId: REQ(1), inputText: "hi", inputKind: "text" });
    expect(a.kind).toBe("created");
    await store.complete(USER_A, (a as { row: { id: string } }).row.id, { ok: true }, []);
    const b = await store.begin(USER_A, { conversationId: CONVERSATION, clientRequestId: REQ(1), inputText: "hi", inputKind: "text" });
    expect(b.kind).toBe("existing");
  });

  it("refuses a second active turn and releases after 60 s abandonment", async () => {
    let now = new Date("2026-09-11T18:00:00Z");
    const store = new InMemoryTurnStore(() => now);
    await store.begin(USER_A, { conversationId: CONVERSATION, clientRequestId: REQ(1), inputText: "a", inputKind: "text" });
    expect((await store.begin(USER_A, { conversationId: CONVERSATION, clientRequestId: REQ(2), inputText: "b", inputKind: "text" })).kind).toBe("busy");
    now = new Date("2026-09-11T18:01:01Z");
    const c = await store.begin(USER_A, { conversationId: CONVERSATION, clientRequestId: REQ(3), inputText: "c", inputKind: "text" });
    expect(c.kind).toBe("created");
    expect(store.all()[0]?.status).toBe("failed");
    expect(store.all()[0]?.error_code).toBe("abandoned");
  });

  it("rate limits at 10 turns per rolling minute", async () => {
    const now = new Date("2026-09-11T18:00:00Z");
    const store = new InMemoryTurnStore(() => now);
    for (let i = 0; i < 10; i += 1) {
      const r = await store.begin(USER_A, { conversationId: CONVERSATION, clientRequestId: `3333333${i}-3333-4333-8333-333333333333`, inputText: "x", inputKind: "text" });
      expect(r.kind).toBe("created");
      await store.complete(USER_A, (r as { row: { id: string } }).row.id, {}, []);
    }
    const r = await store.begin(USER_A, { conversationId: CONVERSATION, clientRequestId: REQ(9), inputText: "x", inputKind: "text" });
    expect(r.kind).toBe("rate_limited");
  });

  it("reopens only failed turns, and only when nothing else is processing", async () => {
    const store = new InMemoryTurnStore();
    const a = await store.begin(USER_A, { conversationId: CONVERSATION, clientRequestId: REQ(1), inputText: "a", inputKind: "text" });
    const id = (a as { row: { id: string } }).row.id;
    expect((await store.reopen(USER_A, id)).kind).toBe("busy"); // still processing
    await store.fail(USER_A, id, "provider_error");
    expect((await store.reopen(USER_A, id)).kind).toBe("reopened");
    expect((await store.reopen(USER_A, id)).kind).toBe("busy");
  });

  it("recentContext excludes invalidated and failed turns, newest first", async () => {
    const store = new InMemoryTurnStore();
    const a = await store.begin(USER_A, { conversationId: CONVERSATION, clientRequestId: REQ(1), inputText: "a", inputKind: "text" });
    await store.complete(USER_A, (a as { row: { id: string } }).row.id, { message: "A" }, []);
    const b = await store.begin(USER_A, { conversationId: CONVERSATION, clientRequestId: REQ(2), inputText: "b", inputKind: "text" });
    await store.fail(USER_A, (b as { row: { id: string } }).row.id, "x");
    expect((await store.recentContext(USER_A, CONVERSATION, 6)).map((t) => t.input_text)).toEqual(["a"]);
    store.invalidate(USER_A);
    expect(await store.recentContext(USER_A, CONVERSATION, 6)).toEqual([]);
  });
});
