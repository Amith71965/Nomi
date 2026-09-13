import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryMemoryStore } from "@/lib/memory/store";
import { MemoryService } from "@/lib/memory/service";
import { createMemoryTool, defaultExpiry, quoteIsFromInput, toTypedValue, updateMemoryTool, type MemoryToolContext } from "@/lib/tools/memory";
import { DEMO_CREATE_ARGS, DEMO_SENTENCE, flat } from "./helpers/fake-model";
import { USER_A, makeMemoryRow } from "./helpers/fake-stores";

const NY = "America/New_York";
const NOW = new Date("2026-09-11T18:00:00Z"); // 2 PM New York
const TURN = "11111111-1111-4111-8111-111111111111";

describe("quoteIsFromInput", () => {
  it("matches case- and whitespace-insensitively, including curly quotes", () => {
    expect(quoteIsFromInput("i'm OUT of   tomatoes", DEMO_SENTENCE)).toBe(true);
    expect(quoteIsFromInput("I’m out of tomatoes", DEMO_SENTENCE)).toBe(true);
    expect(quoteIsFromInput("we need onions", DEMO_SENTENCE)).toBe(false);
    expect(quoteIsFromInput("", DEMO_SENTENCE)).toBe(false);
  });
});

describe("defaultExpiry / toTypedValue", () => {
  it("plans expire at next local midnight, interests in 30 days, tasks in 7, inventory never", () => {
    expect(defaultExpiry("plan", NOW, NY)).toBe("2026-09-12T00:00:00-04:00");
    expect(defaultExpiry("shopping_interest", NOW, NY)).toBe("2026-10-11T14:00:00-04:00");
    expect(defaultExpiry("task", NOW, NY)).toBe("2026-09-18T14:00:00-04:00");
    expect(defaultExpiry("inventory", NOW, NY)).toBeNull();
    expect(defaultExpiry("preference", NOW, NY)).toBeNull();
  });

  it("builds typed values and refuses incomplete ones", () => {
    expect(toTypedValue("inventory", flat({ availability: "out" }), "2026-09-11")).toEqual({ availability: "out" });
    expect(toTypedValue("inventory", flat({}), "2026-09-11")).toBeNull();
    expect(toTypedValue("plan", flat({ meal: "chicken curry" }), "2026-09-11")).toEqual({ meal: "chicken curry", local_date: "2026-09-11" });
    expect(toTypedValue("plan", flat({ meal: "curry", local_date: "tonight" }), "2026-09-11")).toBeNull();
    expect(toTypedValue("task", flat({ intent: "research" }), "2026-09-11")).toBeNull();
    expect(toTypedValue("task", flat({ intent: "buy", group: "groceries" }), "2026-09-11")).toEqual({ intent: "buy", group: "groceries" });
  });
});

describe("createMemoryTool", () => {
  let store: InMemoryMemoryStore;
  let ctx: MemoryToolContext;

  beforeEach(() => {
    store = new InMemoryMemoryStore(() => NOW);
    store.turnCreatedAt.set(TURN, NOW.toISOString());
    ctx = { userId: USER_A, turnId: TURN, inputText: DEMO_SENTENCE, now: NOW, timeZone: NY, source: "text", memory: new MemoryService(store, () => NOW) };
  });

  it("commits the four demo facts with canonical keys and server-derived expiries", async () => {
    const out = await createMemoryTool(DEMO_CREATE_ARGS as Parameters<typeof createMemoryTool>[0], ctx);
    expect(out.skipped).toEqual([]);
    expect(out.changes).toHaveLength(4);
    const rows = store.all();
    expect(rows.map((r) => r.entity_key).sort()).toEqual(["chicken_curry@2026-09-11", "potato", "running_shoes", "tomato"]);
    expect(rows.find((r) => r.category === "plan")?.expires_at).toBe("2026-09-12T00:00:00-04:00");
    expect(rows.find((r) => r.category === "inventory")?.expires_at).toBeNull();
    expect(rows.every((r) => r.source_turn_id === TURN)).toBe(true);
  });

  it("rejects an entry whose quote is not in the user's message (model cannot invent facts)", async () => {
    const out = await createMemoryTool(
      { entries: [{ category: "inventory", entity: "Onions", entity_key: "onions", value: flat({ availability: "out" }), quote: "I'm out of onions", confidence: 0.99, expires_at: null }] },
      ctx,
    );
    expect(out.changes).toEqual([]);
    expect(out.skipped).toEqual([{ entity: "Onions", reason: "quote_not_in_input" }]);
    expect(store.all()).toHaveLength(0);
  });

  it("skips low-confidence and valueless entries with reasons", async () => {
    const out = await createMemoryTool(
      {
        entries: [
          { category: "inventory", entity: "Tomatoes", entity_key: "tomatoes", value: flat({ availability: "out" }), quote: "I'm out of tomatoes", confidence: 0.5, expires_at: null },
          { category: "inventory", entity: "Potatoes", entity_key: "potatoes", value: flat({}), quote: "potatoes", confidence: 0.95, expires_at: null },
        ],
      },
      ctx,
    );
    expect(out.changes).toEqual([]);
    expect(out.skipped.map((s) => s.reason)).toEqual(["low_confidence", "missing_value"]);
  });

  it("honours a valid future expiry from the model and ignores an invalid or past one", async () => {
    const out = await createMemoryTool(
      {
        entries: [
          { category: "shopping_interest", entity: "Running shoes", entity_key: "running shoes", value: flat({ intent: "research" }), quote: "running shoes", confidence: 0.9, expires_at: "2026-09-20T12:00:00-04:00" },
          { category: "inventory", entity: "Tomatoes", entity_key: "tomatoes", value: flat({ availability: "out" }), quote: "tomatoes", confidence: 0.9, expires_at: "next week" },
        ],
      },
      ctx,
    );
    expect(out.changes).toHaveLength(2);
    expect(store.all().find((r) => r.entity_key === "running_shoes")?.expires_at).toBe("2026-09-20T12:00:00-04:00");
    expect(store.all().find((r) => r.entity_key === "tomato")?.expires_at).toBeNull();
  });
});

describe("updateMemoryTool", () => {
  it("applies a correction with the expected version, bumps the version, and keeps the same row", async () => {
    const store = new InMemoryMemoryStore(() => NOW);
    store.seed(makeMemoryRow({ id: "00000000-0000-4000-8000-000000000001", user_id: USER_A, entity_key: "potato", entity: "Potatoes", source_turn_id: null }));
    const ctx: MemoryToolContext = { userId: USER_A, turnId: TURN, inputText: "I bought potatoes", now: NOW, timeZone: NY, source: "text", memory: new MemoryService(store, () => NOW) };
    const out = await updateMemoryTool(
      { entries: [{ id: "00000000-0000-4000-8000-000000000001", expected_version: 1, value: flat({ availability: "available" }), status: null, quote: "I bought potatoes" }] },
      ctx,
    );
    expect(out.skipped).toEqual([]);
    expect(out.changes[0]?.operation).toBe("updated");
    expect(out.changes[0]?.memory.version).toBe(2);
    expect(out.changes[0]?.memory.summary).toBe("Potatoes available");
    expect(store.all()).toHaveLength(1);
  });

  it("skips on version conflict, unknown id, and a quote not in the input", async () => {
    const store = new InMemoryMemoryStore(() => NOW);
    store.seed(makeMemoryRow({ id: "00000000-0000-4000-8000-000000000001", user_id: USER_A, version: 3 }));
    const ctx: MemoryToolContext = { userId: USER_A, turnId: TURN, inputText: "I bought tomatoes", now: NOW, timeZone: NY, source: "text", memory: new MemoryService(store, () => NOW) };
    const out = await updateMemoryTool(
      {
        entries: [
          { id: "00000000-0000-4000-8000-000000000001", expected_version: 1, value: flat({ availability: "available" }), status: null, quote: "I bought tomatoes" },
          { id: "00000000-0000-4000-8000-000000000099", expected_version: 1, value: flat({ availability: "available" }), status: null, quote: "I bought tomatoes" },
          { id: "00000000-0000-4000-8000-000000000001", expected_version: 3, value: flat({ availability: "available" }), status: null, quote: "we're fine on tomatoes" },
        ],
      },
      ctx,
    );
    expect(out.changes).toEqual([]);
    expect(out.skipped.map((s) => s.reason)).toEqual(["version_conflict", "not_found", "quote_not_in_input"]);
  });
});
