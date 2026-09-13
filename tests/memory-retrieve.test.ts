import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@/types/contracts";
import { RETRIEVAL_LIMIT, selectRelevant } from "@/lib/memory/retrieve";

const NY = "America/New_York";
const now = new Date("2026-09-11T18:00:00Z"); // 2 PM New York, local date 2026-09-11

function rec(overrides: Partial<MemoryRecord> & { id: string }): MemoryRecord {
  return {
    category: "inventory",
    entity: "Tomatoes",
    entityKey: "tomato",
    summary: "Out of tomatoes",
    expiresAt: null,
    version: 1,
    value: { availability: "out" },
    status: "active",
    confidence: 0.9,
    source: "text",
    sourceQuote: "q",
    sourceTurnId: null,
    createdAt: "2026-09-11T17:00:00+00:00",
    updatedAt: "2026-09-11T17:00:00+00:00",
    ...overrides,
  };
}

const demo: MemoryRecord[] = [
  rec({ id: "t" }),
  rec({ id: "p", entityKey: "potato", entity: "Potatoes", summary: "Out of potatoes" }),
  rec({
    id: "c",
    category: "plan",
    entityKey: "chicken_curry@2026-09-11",
    entity: "Chicken curry",
    value: { meal: "chicken curry", local_date: "2026-09-11" },
    expiresAt: "2026-09-12T04:00:00+00:00",
  }),
  rec({ id: "s", category: "shopping_interest", entityKey: "running_shoes", entity: "Running shoes", value: { intent: "research" } }),
];

describe("selectRelevant", () => {
  it("'today' separates confirmed needs, tonight's plan, and ongoing interests", () => {
    const r = selectRelevant(demo, { intent: "today", now, timeZone: NY });
    expect(r.needs.map((x) => x.id)).toEqual(["t", "p"]);
    expect(r.plansToday.map((x) => x.id)).toEqual(["c"]);
    expect(r.interests.map((x) => x.id)).toEqual(["s"]);
    expect(r.staleInventory).toEqual([]);
    expect(r.context.map((x) => x.id)).toEqual(["t", "p", "c", "s"]);
  });

  it("excludes expired plans (after local midnight) and completed rows", () => {
    const later = new Date("2026-09-12T05:00:00Z"); // 1 AM Sep 12 New York
    const r = selectRelevant(demo, { intent: "today", now: later, timeZone: NY });
    expect(r.plansToday).toEqual([]);
    expect(r.context.find((x) => x.id === "c")).toBeUndefined();
    const done = selectRelevant([rec({ id: "x", status: "completed" })], { intent: "today", now, timeZone: NY });
    expect(done.context).toEqual([]);
  });

  it("flags inventory older than seven days as stale instead of treating it as a current shortage", () => {
    const old = rec({ id: "old", updatedAt: "2026-09-01T17:00:00+00:00" });
    const r = selectRelevant([old], { intent: "today", now, timeZone: NY });
    expect(r.needs).toEqual([]);
    expect(r.staleInventory.map((x) => x.id)).toEqual(["old"]);
  });

  it("'vegetables' scopes inventory through the taxonomy", () => {
    const withMilk = [...demo, rec({ id: "m", entityKey: "milk", entity: "Milk" })];
    const r = selectRelevant(withMilk, { intent: "vegetables", now, timeZone: NY });
    expect(r.needs.map((x) => x.id)).toEqual(["t", "p"]);
  });

  it("'shopping_interest' returns interests only", () => {
    const r = selectRelevant(demo, { intent: "shopping_interest", now, timeZone: NY });
    expect(r.needs).toEqual([]);
    expect(r.interests.map((x) => x.id)).toEqual(["s"]);
  });

  it("available inventory is not a need", () => {
    const r = selectRelevant([rec({ id: "a", value: { availability: "available" } })], { intent: "today", now, timeZone: NY });
    expect(r.needs).toEqual([]);
  });

  it("caps context at the retrieval limit, most recent first", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      rec({ id: `r${i}`, entityKey: `item_${i}`, updatedAt: `2026-09-11T${(i % 24).toString().padStart(2, "0")}:00:00+00:00` }),
    );
    const r = selectRelevant(many, { intent: "all", now, timeZone: NY });
    expect(r.context).toHaveLength(RETRIEVAL_LIMIT);
  });
});
