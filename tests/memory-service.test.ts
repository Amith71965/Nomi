import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryMemoryStore, type MemoryUpsertEntry } from "@/lib/memory/store";
import { MEMORY_MIN_CONFIDENCE, MemoryService, summarize, toMemoryView } from "@/lib/memory/service";
import { makeMemoryRow, USER_A, USER_B } from "./helpers/fake-stores";

const TURN_1 = "11111111-1111-4111-8111-111111111111";
const TURN_2 = "22222222-2222-4222-8222-222222222222";

function entry(overrides: Partial<MemoryUpsertEntry>): MemoryUpsertEntry {
  return {
    category: "inventory",
    entity: "Tomatoes",
    entityKey: "tomato",
    value: { availability: "out" },
    quote: "I'm out of tomatoes",
    confidence: 0.95,
    source: "text",
    sourceTurnId: TURN_1,
    expiresAt: null,
    ...overrides,
  };
}

const demoFacts: MemoryUpsertEntry[] = [
  entry({}),
  entry({ entity: "Potatoes", entityKey: "potato", quote: "I'm out of potatoes" }),
  entry({
    category: "plan",
    entity: "Chicken curry",
    entityKey: "chicken_curry@2026-09-11",
    value: { meal: "chicken curry", local_date: "2026-09-11" },
    quote: "I'm cooking chicken curry tonight",
    expiresAt: "2026-09-12T04:00:00+00:00",
  }),
  entry({
    category: "shopping_interest",
    entity: "Running shoes",
    entityKey: "running_shoes",
    value: { intent: "research" },
    quote: "I'm looking for running shoes",
    expiresAt: "2026-10-11T18:00:00+00:00",
  }),
];

describe("MemoryService.upsert", () => {
  let store: InMemoryMemoryStore;
  let service: MemoryService;
  let now: Date;

  beforeEach(() => {
    now = new Date("2026-09-11T18:00:00Z");
    store = new InMemoryMemoryStore(() => now);
    store.turnCreatedAt.set(TURN_1, "2026-09-11T18:00:00.000Z");
    store.turnCreatedAt.set(TURN_2, "2026-09-11T19:00:00.000Z");
    service = new MemoryService(store, () => now);
  });

  it("commits the four demo facts as four rows with derived summaries", async () => {
    const changes = await service.upsert(USER_A, demoFacts);
    expect(changes).toHaveLength(4);
    expect(changes.every((c) => c.operation === "created")).toBe(true);
    expect(changes.map((c) => c.memory.summary)).toEqual([
      "Out of tomatoes",
      "Out of potatoes",
      "Cooking chicken curry on 2026-09-11",
      "Looking for running shoes",
    ]);
    expect(changes.map((c) => c.memory.category)).toEqual(["inventory", "inventory", "plan", "shopping_interest"]);
  });

  it("reprocessing the same source turn is a no-op", async () => {
    await service.upsert(USER_A, demoFacts);
    const again = await service.upsert(USER_A, demoFacts);
    expect(again).toEqual([]);
    expect(store.all()).toHaveLength(4);
  });

  it("a later correction updates the same row and bumps the version", async () => {
    await service.upsert(USER_A, demoFacts);
    now = new Date("2026-09-11T19:00:00Z");
    const [change] = await service.upsert(USER_A, [
      entry({ entity: "Potatoes", entityKey: "potato", value: { availability: "available" }, quote: "I bought potatoes", sourceTurnId: TURN_2 }),
    ]);
    expect(change?.operation).toBe("updated");
    expect(change?.memory.version).toBe(2);
    expect(change?.memory.summary).toBe("Potatoes available");
    expect(store.all()).toHaveLength(4);
  });

  it("an older turn cannot overwrite a newer state (retry of a stale request)", async () => {
    now = new Date("2026-09-11T19:00:00Z");
    await service.upsert(USER_A, [entry({ sourceTurnId: TURN_2 })]); // TURN_2 (created 19:00) wrote first
    now = new Date("2026-09-11T20:00:00Z");
    const result = await service.upsert(USER_A, [entry({ value: { availability: "available" }, sourceTurnId: TURN_1 })]); // TURN_1 created 18:00
    expect(result).toEqual([]);
    expect(store.all()[0]?.value).toEqual({ availability: "out" });
    expect(store.all()[0]?.version).toBe(1);
  });

  it("drops entries below the confidence floor instead of guessing", async () => {
    const changes = await service.upsert(USER_A, [entry({ confidence: MEMORY_MIN_CONFIDENCE - 0.01 })]);
    expect(changes).toEqual([]);
  });

  it("rejects a value that does not fit the category, an invalid key, and an empty quote", async () => {
    await expect(service.upsert(USER_A, [entry({ value: { availability: "maybe" } })])).rejects.toMatchObject({ code: "malformed_input" });
    await expect(service.upsert(USER_A, [entry({ entityKey: "Has Spaces" })])).rejects.toMatchObject({ code: "malformed_input" });
    await expect(service.upsert(USER_A, [entry({ quote: "  " })])).rejects.toMatchObject({ code: "malformed_input" });
  });

  it("refuses more than eight entries", async () => {
    await expect(service.upsert(USER_A, Array(9).fill(entry({})))).rejects.toMatchObject({ code: "malformed_input" });
  });
});

describe("MemoryService list/get/patch/delete", () => {
  let store: InMemoryMemoryStore;
  let service: MemoryService;
  const now = new Date("2026-09-11T18:00:00Z");

  beforeEach(() => {
    store = new InMemoryMemoryStore(() => now);
    service = new MemoryService(store, () => now);
    store.seed(makeMemoryRow({ id: "00000000-0000-4000-8000-000000000001", user_id: USER_A }));
    store.seed(
      makeMemoryRow({
        id: "00000000-0000-4000-8000-000000000002",
        user_id: USER_A,
        category: "plan",
        entity_key: "chicken_curry@2026-09-10",
        entity: "Chicken curry",
        value: { meal: "chicken curry", local_date: "2026-09-10" },
        expires_at: "2026-09-11T04:00:00+00:00", // already expired
      }),
    );
    store.seed(makeMemoryRow({ id: "00000000-0000-4000-8000-000000000003", user_id: USER_B, entity_key: "onion", entity: "Onions" }));
  });

  it("list returns only the caller's active, unexpired rows", async () => {
    const rows = await service.list(USER_A);
    expect(rows.map((r) => r.id)).toEqual(["00000000-0000-4000-8000-000000000001"]);
    expect(rows[0]?.summary).toBe("Out of tomatoes");
    expect(rows[0]?.sourceQuote).toBe("I'm out of tomatoes");
  });

  it("get denies another user's row as not_found (no existence leak)", async () => {
    await expect(service.get(USER_A, "00000000-0000-4000-8000-000000000003")).rejects.toMatchObject({ code: "not_found" });
  });

  it("patch with the current version updates, bumps version, marks manual_edit, and invalidates context", async () => {
    const updated = await service.patch(USER_A, "00000000-0000-4000-8000-000000000001", { version: 1, value: { availability: "available" } });
    expect(updated.version).toBe(2);
    expect(updated.source).toBe("manual_edit");
    expect(updated.summary).toBe("Tomatoes available");
    expect(store.invalidations.get(USER_A)).toBe(1);
  });

  it("patch with a stale version is a 409 version_conflict and leaves the row untouched", async () => {
    await service.patch(USER_A, "00000000-0000-4000-8000-000000000001", { version: 1, status: "completed" });
    await expect(
      service.patch(USER_A, "00000000-0000-4000-8000-000000000001", { version: 1, value: { availability: "out" } }),
    ).rejects.toMatchObject({ code: "version_conflict", status: 409 });
  });

  it("patch refuses a value that does not fit the row's category", async () => {
    await expect(
      service.patch(USER_A, "00000000-0000-4000-8000-000000000001", { version: 1, value: { meal: "x", local_date: "2026-01-01" } }),
    ).rejects.toMatchObject({ code: "malformed_input" });
  });

  it("patch and delete are refused while a turn is in progress", async () => {
    store.activeTurnUsers.add(USER_A);
    await expect(service.patch(USER_A, "00000000-0000-4000-8000-000000000001", { version: 1, status: "completed" })).rejects.toMatchObject({
      code: "turn_in_progress",
    });
    await expect(service.delete(USER_A, "00000000-0000-4000-8000-000000000001", 1)).rejects.toMatchObject({ code: "turn_in_progress" });
  });

  it("delete requires the matching version and invalidates context", async () => {
    await expect(service.delete(USER_A, "00000000-0000-4000-8000-000000000001", 2)).rejects.toMatchObject({ code: "version_conflict" });
    await service.delete(USER_A, "00000000-0000-4000-8000-000000000001", 1);
    expect(await store.get(USER_A, "00000000-0000-4000-8000-000000000001")).toBeNull();
    expect(store.invalidations.get(USER_A)).toBe(1);
    await expect(service.delete(USER_A, "00000000-0000-4000-8000-000000000001", 1)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("summaries", () => {
  it("cover every category without inventing detail", () => {
    expect(summarize("inventory", "Tomatoes", { availability: "low" })).toBe("Running low on tomatoes");
    expect(summarize("task", "Snacks", { intent: "buy", group: "groceries" })).toBe("Need to buy snacks");
    expect(summarize("task", "Call plumber", { intent: "do", group: null })).toBe("To do: call plumber");
    expect(summarize("preference", "Spice", { note: "Prefers mild curry" })).toBe("Prefers mild curry");
    expect(summarize("shopping_interest", "Running shoes", { intent: "buy" })).toBe("Planning to buy running shoes");
    const view = toMemoryView(makeMemoryRow({ id: "00000000-0000-4000-8000-000000000009", user_id: USER_A }));
    expect(view).toEqual({
      id: "00000000-0000-4000-8000-000000000009",
      category: "inventory",
      entity: "Tomatoes",
      summary: "Out of tomatoes",
      expiresAt: null,
      version: 1,
    });
  });
});
