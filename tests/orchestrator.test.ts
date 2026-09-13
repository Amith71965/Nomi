import { beforeEach, describe, expect, it } from "vitest";
import { runTurn, LIMITS, type OrchestratorDeps } from "@/lib/ai/orchestrator";
import { processAssistantRequest } from "@/lib/ai/service";
import { InMemoryMemoryStore } from "@/lib/memory/store";
import { MemoryService } from "@/lib/memory/service";
import { InMemoryTurnStore } from "@/lib/turns/store";
import { assistantResponseSchema } from "@/lib/schemas/assistant";
import { DEMO_CREATE_ARGS, DEMO_SENTENCE, FakeModel, answer, flat, toolCall } from "./helpers/fake-model";
import { CONVERSATION, USER_A, makeMemoryRow } from "./helpers/fake-stores";

const NY = "America/New_York";
const NOW = new Date("2026-09-11T18:00:00Z");
const OFF = { research: false, calendar: false, voice: false };

function deps(model: FakeModel, memoryStore: InMemoryMemoryStore, turnStore: InMemoryTurnStore, capabilities = OFF): OrchestratorDeps {
  let n = 0;
  return {
    model,
    memory: new MemoryService(memoryStore, () => NOW),
    turns: turnStore,
    capabilities,
    newId: () => `aaaaaaaa-0000-4000-8000-${(++n).toString().padStart(12, "0")}`,
  };
}

function textBody(text: string, clientRequestId = "44444444-4444-4444-8444-444444444444") {
  return { clientRequestId, conversationId: CONVERSATION, text, inputKind: "text" as const, timeZone: NY };
}

describe("runTurn", () => {
  let memoryStore: InMemoryMemoryStore;
  let turnStore: InMemoryTurnStore;

  beforeEach(() => {
    memoryStore = new InMemoryMemoryStore(() => NOW);
    turnStore = new InMemoryTurnStore(() => NOW);
  });

  it("four-fact demo: one batched create_memory call → four committed rows, memory card, honest chips", async () => {
    const model = new FakeModel([
      toolCall("create_memory", DEMO_CREATE_ARGS),
      answer({ message: "Saved four things.", suggested_intent_names: ["research_groceries", "open_memory"] }),
    ]);
    const d = deps(model, memoryStore, turnStore);
    const begun = await turnStore.begin(USER_A, { conversationId: CONVERSATION, clientRequestId: "44444444-4444-4444-8444-444444444444", inputText: DEMO_SENTENCE, inputKind: "text" });
    const turnId = (begun as { row: { id: string } }).row.id;
    memoryStore.turnCreatedAt.set(turnId, NOW.toISOString());

    const out = await runTurn(d, { userId: USER_A, turnId, conversationId: CONVERSATION, inputText: DEMO_SENTENCE, inputKind: "text", timeZone: NY, now: NOW });

    expect(assistantResponseSchema.safeParse(out.response).success).toBe(true);
    expect(out.response.memory_updates).toHaveLength(4);
    expect(out.response.memory_updates.map((m) => m.category)).toEqual(["inventory", "inventory", "plan", "shopping_interest"]);
    expect(out.response.ui[0]?.type).toBe("memory_update");
    expect(out.response.message).toBe("Saved four things.");
    // Research is off, so "Groceries" must not be offered even though the model asked for it.
    // The model's allowed hint (open_memory) keeps its place; the plan-for-today chip is added after.
    expect(out.response.suggested_actions.map((a) => a.intent.kind)).toEqual(["open_memory", "review_curry_ingredients"]);
    expect(out.usage).toEqual({ rounds: 2, toolCalls: 1, finished: "final" });
    // The model saw the tool result as data.
    const toolMsg = model.requests[1]?.messages.find((m) => m.role === "tool");
    expect(toolMsg && "content" in toolMsg && toolMsg.content).toContain('"committed"');
  });

  it("a question is not an assertion: no tool call → no memory, plain answer", async () => {
    const model = new FakeModel([answer({ message: "I don't have a note about tomatoes." })]);
    const out = await runTurn(deps(model, memoryStore, turnStore), {
      userId: USER_A, turnId: "10000000-0000-4000-8000-000000000001", conversationId: CONVERSATION, inputText: "Are we out of tomatoes?", inputKind: "text", timeZone: NY, now: NOW,
    });
    expect(memoryStore.all()).toEqual([]);
    expect(out.response.memory_updates).toEqual([]);
    expect(out.response.ui).toEqual([]);
  });

  it("a model cannot fabricate a fact: create_memory with a quote not in the input is rejected", async () => {
    const model = new FakeModel([
      toolCall("create_memory", { entries: [{ category: "inventory", entity: "Onions", entity_key: "onions", value: flat({ availability: "out" }), quote: "I'm out of onions", confidence: 0.99, expires_at: null }] }),
      answer({ message: "Noted." }),
    ]);
    const out = await runTurn(deps(model, memoryStore, turnStore), {
      userId: USER_A, turnId: "10000000-0000-4000-8000-000000000001", conversationId: CONVERSATION, inputText: "Are we out of onions?", inputKind: "text", timeZone: NY, now: NOW,
    });
    expect(memoryStore.all()).toEqual([]);
    expect(out.response.memory_updates).toEqual([]);
    const toolMsg = model.requests[1]?.messages.find((m) => m.role === "tool");
    expect(toolMsg && "content" in toolMsg && toolMsg.content).toContain("quote_not_in_input");
  });

  it("correction: update_memory turns an 'out' row into 'available' on the same row", async () => {
    memoryStore.seed(makeMemoryRow({ id: "00000000-0000-4000-8000-000000000001", user_id: USER_A, entity_key: "potato", entity: "Potatoes" }));
    const model = new FakeModel([
      toolCall("update_memory", { entries: [{ id: "00000000-0000-4000-8000-000000000001", expected_version: 1, value: flat({ availability: "available" }), status: null, quote: "I bought potatoes" }] }),
      answer({ message: "Updated: potatoes available." }),
    ]);
    const out = await runTurn(deps(model, memoryStore, turnStore), {
      userId: USER_A, turnId: "10000000-0000-4000-8000-000000000001", conversationId: CONVERSATION, inputText: "I bought potatoes", inputKind: "text", timeZone: NY, now: NOW,
    });
    expect(memoryStore.all()).toHaveLength(1);
    expect(memoryStore.all()[0]?.value).toEqual({ availability: "available" });
    expect(out.response.memory_updates[0]?.summary).toBe("Potatoes available");
    expect(out.response.ui[0]).toMatchObject({ type: "memory_update", data: { changes: [{ operation: "updated" }] } });
  });

  it("tool budget: an endless tool loop stops at the limits with an honest partial answer", async () => {
    const model = new FakeModel(Array(10).fill(null).map(() => toolCall("get_memories", { categories: [], entity_keys: [], limit: 5 })));
    const out = await runTurn(deps(model, memoryStore, turnStore), {
      userId: USER_A, turnId: "10000000-0000-4000-8000-000000000001", conversationId: CONVERSATION, inputText: "hello", inputKind: "text", timeZone: NY, now: NOW,
    });
    expect(out.usage.rounds).toBe(LIMITS.rounds);
    expect(out.usage.finished).toBe("budget");
    expect(out.response.message).toMatch(/couldn't finish/);
    expect(out.response.ui).toEqual([]);
  });

  it("a forbidden tool name is refused as data and never executed", async () => {
    const model = new FakeModel([toolCall("create_calendar_event", { title: "x" }), answer({ message: "ok" })]);
    const out = await runTurn(deps(model, memoryStore, turnStore), {
      userId: USER_A, turnId: "10000000-0000-4000-8000-000000000001", conversationId: CONVERSATION, inputText: "add an event", inputKind: "text", timeZone: NY, now: NOW,
    });
    const toolMsg = model.requests[1]?.messages.find((m) => m.role === "tool");
    expect(toolMsg && "content" in toolMsg && toolMsg.content).toContain("unsupported_tool");
    expect(out.response.requested_action).toBeNull();
    expect(out.response.ui).toEqual([]);
  });

  it("repairs one invalid final answer, then accepts the valid one", async () => {
    const model = new FakeModel([{ kind: "final", content: "not json" }, answer({ message: "fixed" })]);
    const out = await runTurn(deps(model, memoryStore, turnStore), {
      userId: USER_A, turnId: "10000000-0000-4000-8000-000000000001", conversationId: CONVERSATION, inputText: "hi", inputKind: "text", timeZone: NY, now: NOW,
    });
    expect(out.response.message).toBe("fixed");
    expect(model.requests[1]?.messages.at(-1)).toMatchObject({ role: "system" });
  });

  it("refusal after memory writes keeps the committed facts and says so", async () => {
    const model = new FakeModel([toolCall("create_memory", DEMO_CREATE_ARGS), { kind: "refusal", reason: "policy" }]);
    memoryStore.turnCreatedAt.set("10000000-0000-4000-8000-000000000001", NOW.toISOString());
    const out = await runTurn(deps(model, memoryStore, turnStore), {
      userId: USER_A, turnId: "10000000-0000-4000-8000-000000000001", conversationId: CONVERSATION, inputText: DEMO_SENTENCE, inputKind: "text", timeZone: NY, now: NOW,
    });
    expect(out.usage.finished).toBe("refusal");
    expect(out.response.memory_updates).toHaveLength(4);
    expect(out.response.message).toMatch(/Saved 4 memories/);
  });

  it("decision card: keys are verified against memory; unknown keys are dropped and disclosed", async () => {
    memoryStore.seed(makeMemoryRow({ id: "00000000-0000-4000-8000-000000000001", user_id: USER_A }));
    memoryStore.seed(makeMemoryRow({ id: "00000000-0000-4000-8000-000000000002", user_id: USER_A, entity_key: "potato", entity: "Potatoes" }));
    memoryStore.seed(makeMemoryRow({ id: "00000000-0000-4000-8000-000000000003", user_id: USER_A, category: "shopping_interest", entity_key: "running_shoes", entity: "Running shoes", value: { intent: "research" } }));
    const model = new FakeModel([
      answer({
        message: "Buy tomatoes and potatoes.",
        reason_codes: ["matches_confirmed_need"],
        decision: { title: "Groceries for today; shoes can wait", confirmed_need_keys: ["tomatoes", "potato", "onion"], suggestion_keys: ["Onion", "Garlic", " "], other_interest_keys: ["running shoes"], limitations: [] },
      }),
    ]);
    const out = await runTurn(deps(model, memoryStore, turnStore), {
      userId: USER_A, turnId: "10000000-0000-4000-8000-000000000001", conversationId: CONVERSATION, inputText: "What should I buy today?", inputKind: "text", timeZone: NY, now: NOW,
    });
    const card = out.response.ui.find((b) => b.type === "decision_card");
    expect(card).toBeDefined();
    if (card?.type !== "decision_card") throw new Error("expected decision card");
    expect(card.data.confirmedNeeds).toEqual(["Tomatoes", "Potatoes"]);
    expect(card.data.otherInterests).toEqual(["Running shoes"]);
    expect(card.data.suggestionsToCheck).toEqual(["Onion", "Garlic"]);
    expect(card.data.limitations).toContain("Suggested ingredients are not confirmed shortages.");
    expect(card.data.limitations).toContain("Some items could not be matched to saved memories and were left out.");
    expect(card.data.reasons).toEqual(["Matches a need you confirmed."]);
    expect(card.data.recommendedProductId).toBeNull();
  });

  it("offers Groceries only when research is on AND there is a confirmed need", async () => {
    memoryStore.seed(makeMemoryRow({ id: "00000000-0000-4000-8000-000000000001", user_id: USER_A }));
    const withResearch = { ...OFF, research: true };
    const model = new FakeModel([answer({ message: "x", suggested_intent_names: ["research_groceries"] })]);
    const out = await runTurn(deps(model, memoryStore, turnStore, withResearch), {
      userId: USER_A, turnId: "10000000-0000-4000-8000-000000000001", conversationId: CONVERSATION, inputText: "what should I buy?", inputKind: "text", timeZone: NY, now: NOW,
    });
    expect(out.response.suggested_actions.map((a) => a.label)).toEqual(["Groceries", "View memories"]);
    // Tools offered to the model include search only when research is on.
    expect(model.requests[0]?.tools.map((t) => t.function.name)).toContain("search_products");
  });
});

describe("processAssistantRequest", () => {
  let memoryStore: InMemoryMemoryStore;
  let turnStore: InMemoryTurnStore;

  beforeEach(() => {
    memoryStore = new InMemoryMemoryStore(() => NOW);
    turnStore = new InMemoryTurnStore(() => NOW);
  });

  it("is idempotent: the same clientRequestId returns the stored response and calls the model once", async () => {
    const model = new FakeModel([answer({ message: "first" })]);
    const d = deps(model, memoryStore, turnStore);
    const a = await processAssistantRequest(d, { userId: USER_A, body: textBody("hi"), now: NOW });
    const b = await processAssistantRequest(d, { userId: USER_A, body: textBody("hi"), now: NOW });
    expect(b).toEqual(a);
    expect(model.requests).toHaveLength(1);
    expect(turnStore.all()).toHaveLength(1);
    expect(turnStore.all()[0]?.status).toBe("completed");
  });

  it("records a failure and rethrows; a retry with the same id reopens the turn", async () => {
    const model = new FakeModel([
      () => {
        throw new Error("boom");
      },
      answer({ message: "second try" }),
    ]);
    const d = deps(model, memoryStore, turnStore);
    await expect(processAssistantRequest(d, { userId: USER_A, body: textBody("hi"), now: NOW })).rejects.toMatchObject({ code: "internal_error" });
    expect(turnStore.all()[0]?.status).toBe("failed");
    const again = await processAssistantRequest(d, { userId: USER_A, body: textBody("hi"), now: NOW });
    expect(again.message).toBe("second try");
    expect(turnStore.all()).toHaveLength(1);
  });

  it("refuses a second concurrent turn with 409 turn_in_progress", async () => {
    await turnStore.begin(USER_A, { conversationId: CONVERSATION, clientRequestId: "55555555-5555-4555-8555-555555555555", inputText: "busy", inputKind: "text" });
    const d = deps(new FakeModel([]), memoryStore, turnStore);
    await expect(processAssistantRequest(d, { userId: USER_A, body: textBody("hi"), now: NOW })).rejects.toMatchObject({ code: "turn_in_progress", status: 409 });
  });

  it("enforces the deadline", async () => {
    const model = new FakeModel([() => new Promise(() => undefined) as unknown as ReturnType<FakeModel["complete"]> extends Promise<infer R> ? R : never]);
    const d = deps(model, memoryStore, turnStore);
    await expect(processAssistantRequest(d, { userId: USER_A, body: textBody("slow"), now: NOW, deadlineMs: 20 })).rejects.toMatchObject({ code: "deadline_exceeded" });
    expect(turnStore.all()[0]?.status).toBe("failed");
    expect(turnStore.all()[0]?.error_code).toBe("deadline_exceeded");
  });

  it("suggestion click: open_memory answers directly; a stale source turn is 409; unknown id is 404; research runs a model turn", async () => {
    const model = new FakeModel([answer({ message: "saved", suggested_intent_names: ["open_memory"] }), answer({ message: "Here are options." })]);
    const d = deps(model, memoryStore, turnStore, { ...OFF, research: true });
    memoryStore.seed(makeMemoryRow({ id: "00000000-0000-4000-8000-000000000001", user_id: USER_A }));
    const first = await processAssistantRequest(d, { userId: USER_A, body: textBody("hi"), now: NOW });
    const openMemory = first.suggested_actions.find((a) => a.intent.kind === "open_memory")!;
    const groceries = first.suggested_actions.find((a) => a.intent.kind === "research_groceries")!;

    const direct = await processAssistantRequest(d, {
      userId: USER_A,
      body: { clientRequestId: "66666666-6666-4666-8666-666666666666", conversationId: CONVERSATION, sourceTurnId: first.turnId, suggestionId: openMemory.id, timeZone: NY },
      now: NOW,
    });
    expect(direct.message).toMatch(/Memory panel/);
    expect(model.requests).toHaveLength(1); // no model call for a direct intent

    const researched = await processAssistantRequest(d, { userId: USER_A, body: { clientRequestId: "66666666-6666-4666-8666-666666666667", conversationId: CONVERSATION, sourceTurnId: first.turnId, suggestionId: groceries.id, timeZone: NY }, now: NOW });
    expect(researched.message).toBe("Here are options.");
    const lastUser = model.requests[1]?.messages.findLast((m) => m.role === "user");
    expect(lastUser && "content" in lastUser && lastUser.content).toMatch(/confirmed needs/);

    await expect(
      processAssistantRequest(d, { userId: USER_A, body: { clientRequestId: "66666666-6666-4666-8666-666666666668", conversationId: CONVERSATION, sourceTurnId: first.turnId, suggestionId: "00000000-0000-4000-8000-00000000dead", timeZone: NY }, now: NOW }),
    ).rejects.toMatchObject({ code: "not_found" });

    turnStore.invalidate(USER_A);
    await expect(
      processAssistantRequest(d, { userId: USER_A, body: { clientRequestId: "66666666-6666-4666-8666-666666666669", conversationId: CONVERSATION, sourceTurnId: first.turnId, suggestionId: openMemory.id, timeZone: NY }, now: NOW }),
    ).rejects.toMatchObject({ code: "stale_context", status: 409 });
  });
});
