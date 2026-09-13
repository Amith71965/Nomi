import { beforeEach, describe, expect, it } from "vitest";
import { runTurn, type OrchestratorDeps } from "@/lib/ai/orchestrator";
import { FixtureShoppingProvider } from "@/lib/integrations/shopping";
import { MemoryService } from "@/lib/memory/service";
import { InMemoryMemoryStore } from "@/lib/memory/store";
import { assistantResponseSchema } from "@/lib/schemas/assistant";
import { InMemoryTurnStore } from "@/lib/turns/store";
import { FakeModel, answer, toolCall } from "./helpers/fake-model";
import { CONVERSATION, USER_A, makeMemoryRow } from "./helpers/fake-stores";

const NY = "America/New_York";
const NOW = new Date("2026-09-13T18:00:00Z");
const TURN = "10000000-0000-4000-8000-000000000001";

function deps(model: FakeModel, memoryStore: InMemoryMemoryStore, research: boolean): OrchestratorDeps {
  let n = 0;
  return {
    model,
    memory: new MemoryService(memoryStore, () => NOW),
    turns: new InMemoryTurnStore(() => NOW),
    capabilities: { research, calendar: false, voice: false },
    research: new FixtureShoppingProvider("cached"),
    newId: () => `aaaaaaaa-0000-4000-8000-${(++n).toString().padStart(12, "0")}`,
  };
}

describe("research turn", () => {
  let memoryStore: InMemoryMemoryStore;
  beforeEach(() => {
    memoryStore = new InMemoryMemoryStore(() => NOW);
    memoryStore.seed(makeMemoryRow({ id: "00000000-0000-4000-8000-00000000000a", user_id: USER_A, entity_key: "tomato", entity: "Tomatoes", value: { availability: "out" } }));
    memoryStore.seed(makeMemoryRow({ id: "00000000-0000-4000-8000-00000000000b", user_id: USER_A, entity_key: "potato", entity: "Potatoes", value: { availability: "out" } }));
  });

  it("search → compare → decision produces a labelled results card and a recommendation that exists in the results", async () => {
    let searchId = "";
    let firstId = "";
    const model = new FakeModel([
      toolCall("search_products", { items: [{ item_key: "tomato", query: "fresh tomatoes" }, { item_key: "potato", query: "fresh potatoes" }], currency: "USD", max_results_per_item: 3 }),
      (req) => {
        const tool = req.messages.findLast((m) => m.role === "tool");
        const result = JSON.parse(tool && "content" in tool ? tool.content : "{}") as { search_id: string; items: Array<{ results: Array<{ id: string }> }> };
        searchId = result.search_id;
        firstId = result.items[0].results[0].id;
        return toolCall("compare_options", { search_id: searchId, item_key: "tomato", result_ids: result.items[0].results.map((r) => r.id), profile: "groceries", sort: "value" });
      },
      () =>
        answer({
          message: "Two options stand out.",
          selected_product_ids: [firstId, "made-up-id"],
          reason_codes: ["lowest_unit_price", "matches_confirmed_need"],
          decision: { title: "Groceries for tonight", confirmed_need_keys: ["tomato", "potato"], suggestion_keys: ["onions"], other_interest_keys: [], limitations: [] },
        }),
    ]);
    const out = await runTurn(deps(model, memoryStore, true), { userId: USER_A, turnId: TURN, conversationId: CONVERSATION, inputText: "What should I buy?", inputKind: "text", timeZone: NY, now: NOW });
    expect(assistantResponseSchema.safeParse(out.response).success).toBe(true);
    expect(out.response.ui.map((b) => b.type)).toEqual(["shopping_results", "decision_card"]);
    const results = out.response.ui[0];
    if (results.type !== "shopping_results") throw new Error("expected results");
    expect(results.data.items.map((i) => i.key)).toEqual(["tomato", "potato"]);
    expect(results.data.products.length).toBeGreaterThan(0);
    expect(results.data.products.length).toBeLessThanOrEqual(6);
    expect(results.data.products.every((p) => p.evidence.mode === "cached")).toBe(true);
    expect(results.data.notice).toMatch(/Cached/);
    const decision = out.response.ui[1];
    if (decision.type !== "decision_card") throw new Error("expected decision");
    expect(decision.data.recommendedProductId).toBe(firstId);
    expect(decision.data.confirmedNeeds).toEqual(["Tomatoes", "Potatoes"]);
    expect(decision.data.suggestionsToCheck).toEqual(["onions"]);
    expect(out.evidence.length).toBeGreaterThan(0);
    expect(out.usage.toolCalls).toBe(2);
    // The model's second, fabricated id was ignored.
    expect(JSON.stringify(out.response)).not.toContain("made-up-id");
  });

  it("research tools are refused when the capability is off, even if the model asks", async () => {
    const model = new FakeModel([
      toolCall("search_products", { items: [{ item_key: "tomato", query: "fresh tomatoes" }], currency: "USD", max_results_per_item: 3 }),
      answer({ message: "I cannot search here." }),
    ]);
    const out = await runTurn(deps(model, memoryStore, false), { userId: USER_A, turnId: TURN, conversationId: CONVERSATION, inputText: "Find tomatoes", inputKind: "text", timeZone: NY, now: NOW });
    expect(out.response.ui).toEqual([]);
    const toolMsg = model.requests[1]?.messages.find((m) => m.role === "tool");
    expect(toolMsg && "content" in toolMsg && toolMsg.content).toContain("unsupported_tool");
  });
});
