import { describe, expect, it } from "vitest";
import fixture from "@/fixtures/serpapi-google-shopping.json";
import { FixtureShoppingProvider, SerpApiShoppingProvider } from "@/lib/integrations/shopping";
import { productSchema } from "@/lib/schemas/assistant";
import { compareOptionsTool, filterKeyFor, searchProductsTool, type ResearchContext } from "@/lib/tools/research";

function ctx(provider: ResearchContext["provider"]): ResearchContext {
  let n = 0;
  return { provider, searches: new Map(), newId: () => `aaaaaaaa-0000-4000-8000-${(++n).toString().padStart(12, "0")}` };
}

const live = () =>
  new SerpApiShoppingProvider({
    apiKey: "k",
    location: null,
    fetchImpl: async () => new Response(JSON.stringify(fixture), { status: 200, headers: { "content-type": "application/json" } }),
    now: () => new Date("2026-09-13T15:00:00.000Z"),
  });

describe("search_products", () => {
  it("excludes ketchup and seeds, keeps at most N relevant listings, ranks, and stores the search for the turn", async () => {
    const c = ctx(live());
    const out = await searchProductsTool({ items: [{ item_key: "tomatoes", query: "fresh tomatoes" }], currency: "USD", max_results_per_item: 3 }, c);
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.items[0].item_key).toBe("tomato");
    const titles = out.items[0].results.map((r) => (r as { title: string }).title);
    expect(titles.some((t) => /ketchup/i.test(t))).toBe(false);
    expect(titles.some((t) => /seed/i.test(t))).toBe(false);
    expect(titles.length).toBeLessThanOrEqual(3);
    expect(out.items[0].excluded).toBe(2);
    const stored = c.searches.get(out.search_id);
    expect(stored?.items).toEqual([{ key: "tomato", label: "Tomato" }]);
    for (const p of stored?.products ?? []) {
      productSchema.parse(p);
      expect(p.reason.length).toBeGreaterThan(0);
      expect(p.score).not.toBeNull();
    }
    // A listing without a price is never shown as $0 and says so.
    const vine = stored?.products.find((p) => p.title === "Fresh Tomatoes on the Vine");
    if (vine) expect(vine.reason).toMatch(/Price not listed/);
    expect(JSON.stringify(out)).not.toContain('"price_usd":0');
  });

  it("refuses a third search in one turn and labels cached results", async () => {
    const c = ctx(new FixtureShoppingProvider("cached"));
    const a = await searchProductsTool({ items: [{ item_key: "tomatoes", query: "fresh tomatoes" }], currency: "USD", max_results_per_item: 3 }, c);
    expect("error" in a ? null : a.notice).toMatch(/Cached listings from 2026-09-13/);
    await searchProductsTool({ items: [{ item_key: "potatoes", query: "fresh potatoes" }], currency: "USD", max_results_per_item: 3 }, c);
    const third = await searchProductsTool({ items: [{ item_key: "onions", query: "onions" }], currency: "USD", max_results_per_item: 3 }, c);
    expect("error" in third && third.error).toBe("search_budget_exhausted");
  });

  it("reports an item with no relevant listings instead of inventing one", async () => {
    const c = ctx(new FixtureShoppingProvider("fixture"));
    const out = await searchProductsTool({ items: [{ item_key: "saffron", query: "saffron" }], currency: "USD", max_results_per_item: 3 }, c);
    expect("error" in out ? "" : out.notice).toMatch(/No relevant listings/);
  });
});

describe("location", () => {
  it("passes the user's own location to the provider and warns when none is set", async () => {
    let seen: string | null | undefined;
    const provider = {
      mode: "live" as const,
      async search(input: { location?: string | null }) {
        seen = input.location;
        return { products: [], searchUrl: "https://www.google.com/search?tbm=shop&q=x", retrievedAt: "2026-09-13T15:00:00.000Z", mode: "live" as const };
      },
    };
    const withLocation = { ...ctx(provider), location: "Austin, Texas, United States" };
    await searchProductsTool({ items: [{ item_key: "tomatoes", query: "fresh tomatoes" }], currency: "USD", max_results_per_item: 3 }, withLocation);
    expect(seen).toBe("Austin, Texas, United States");

    const without = ctx(provider);
    const out = await searchProductsTool({ items: [{ item_key: "tomatoes", query: "fresh tomatoes" }], currency: "USD", max_results_per_item: 3 }, without);
    expect(seen).toBeNull();
    expect("error" in out ? "" : out.notice).toMatch(/No shopping location is set/);
  });
});

describe("compare_options", () => {
  it("sorts by unit price with unpriced listings last and refuses ids from another search", async () => {
    const c = ctx(live());
    const search = await searchProductsTool({ items: [{ item_key: "tomatoes", query: "fresh tomatoes" }], currency: "USD", max_results_per_item: 3 }, c);
    if ("error" in search) throw new Error("search failed");
    const ids = search.items[0].results.map((r) => (r as { id: string }).id);
    const byPrice = await compareOptionsTool({ search_id: search.search_id, item_key: "tomato", result_ids: ids, profile: "groceries", sort: "price" }, c);
    if ("error" in byPrice) throw new Error(byPrice.error);
    const perKg = byPrice.ordered.map((o) => o.price_per_kg_usd);
    const priced = perKg.filter((v): v is number => v !== null);
    expect(priced).toEqual([...priced].sort((a, b) => a - b));
    expect(perKg.slice(priced.length).every((v) => v === null)).toBe(true);
    const wrong = await compareOptionsTool({ search_id: "bbbbbbbb-0000-4000-8000-000000000000", item_key: "tomato", result_ids: ids, profile: "groceries", sort: "value" }, c);
    expect("error" in wrong && wrong.error).toBe("unknown_search");
    const foreign = await compareOptionsTool({ search_id: search.search_id, item_key: "tomato", result_ids: ["nope"], profile: "groceries", sort: "value" }, c);
    expect("error" in foreign && foreign.error).toBe("no_matching_results");
  });

  it("says when fewer than two listings are price-comparable", async () => {
    const c = ctx(new FixtureShoppingProvider("cached"));
    const search = await searchProductsTool({ items: [{ item_key: "onions", query: "onions" }], currency: "USD", max_results_per_item: 3 }, c);
    if ("error" in search) throw new Error("search failed");
    const out = await compareOptionsTool({ search_id: search.search_id, item_key: "onion", result_ids: search.items[0].results.map((r) => (r as { id: string }).id), profile: "groceries", sort: "price" }, c);
    expect("error" in out ? "" : out.note).toMatch(/Fewer than two/);
  });

  it("maps plural keys onto the relevance tables", () => {
    expect(filterKeyFor("tomato")).toBe("tomato");
    expect(filterKeyFor("tomatoes")).toBe("tomato");
    expect(filterKeyFor("onions")).toBe("onion");
    expect(filterKeyFor("saffron")).toBe("saffron");
  });
});
