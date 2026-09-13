import { describe, expect, it } from "vitest";
import fixture from "@/fixtures/serpapi-google-shopping.json";
import { FixtureShoppingProvider, SerpApiShoppingProvider, shoppingProviderFromEnv, toProduct } from "@/lib/integrations/shopping";
import { productSchema } from "@/lib/schemas/assistant";
import { serpApiListingSchema } from "@/lib/schemas/shopping";

const NOW = new Date("2026-09-13T15:00:00.000Z");

function fakeFetch(status: number, body: unknown, capture?: { url?: string }) {
  return async (url: string) => {
    if (capture) capture.url = url;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
}

describe("SerpApiShoppingProvider", () => {
  it("calls the fixed engine with the key, location, and query, and maps listings to nullable products", async () => {
    const capture: { url?: string } = {};
    const provider = new SerpApiShoppingProvider({ apiKey: "serp-secret", location: "Austin, Texas, United States", fetchImpl: fakeFetch(200, fixture, capture), now: () => NOW });
    const result = await provider.search({ itemKey: "tomato", query: "fresh tomatoes", limit: 3 });
    const url = new URL(capture.url ?? "");
    expect(url.origin + url.pathname).toBe("https://serpapi.com/search.json");
    expect(url.searchParams.get("engine")).toBe("google_shopping");
    expect(url.searchParams.get("q")).toBe("fresh tomatoes");
    expect(url.searchParams.get("location")).toBe("Austin, Texas, United States");
    expect(url.searchParams.get("api_key")).toBe("serp-secret");
    expect(result.mode).toBe("live");
    expect(result.retrievedAt).toBe(NOW.toISOString());
    for (const p of result.products) productSchema.parse(p);
    const roma = result.products.find((p) => p.title.startsWith("Fresh Roma"));
    expect(roma).toMatchObject({ priceAmount: 1.99, currency: "USD", unitLabel: "1 lb", merchant: "Example Grocer", destinationKind: "merchant", fulfillment: "delivery", availability: "unknown" });
    expect(roma?.normalizedPricePerKg).toBeCloseTo(4.39, 1);
    const vine = result.products.find((p) => p.title === "Fresh Tomatoes on the Vine");
    expect(vine).toMatchObject({ priceAmount: null, currency: null, normalizedPricePerKg: null, fulfillment: "both" });
    const cherry = result.products.find((p) => p.title.startsWith("Cherry"));
    expect(cherry?.destinationKind).toBe("search_listing");
    expect(JSON.stringify(result)).not.toContain("serp-secret");
  });

  it("maps provider failures honestly", async () => {
    const bad = new SerpApiShoppingProvider({ apiKey: "k", location: null, fetchImpl: fakeFetch(401, { error: "Invalid API key" }) });
    await expect(bad.search({ itemKey: "tomato", query: "x", limit: 3 })).rejects.toMatchObject({ code: "provider_error", retryable: false });
    const limited = new SerpApiShoppingProvider({ apiKey: "k", location: null, fetchImpl: fakeFetch(429, {}) });
    await expect(limited.search({ itemKey: "tomato", query: "x", limit: 3 })).rejects.toMatchObject({ code: "rate_limited" });
    const errored = new SerpApiShoppingProvider({ apiKey: "k", location: null, fetchImpl: fakeFetch(200, { error: "Google hasn't returned any results for this query." }) });
    await expect(errored.search({ itemKey: "tomato", query: "x", limit: 3 })).rejects.toMatchObject({ code: "provider_error" });
  });

  it("drops a listing with no honest destination and never invents a price", () => {
    const listing = serpApiListingSchema.parse({ title: "Mystery tomatoes", source: "Nowhere" });
    expect(toProduct(listing, { id: "x", itemKey: "tomato", retrievedAt: NOW.toISOString(), mode: "live", searchUrl: "https://www.google.com/search?tbm=shop&q=t" })).toBeNull();
    const priced = toProduct(serpApiListingSchema.parse({ title: "Tomatoes", link: "https://shop.example/t", price: "Call us" }), { id: "y", itemKey: "tomato", retrievedAt: NOW.toISOString(), mode: "live", searchUrl: "https://www.google.com/search?tbm=shop&q=t" });
    expect(priced?.priceAmount).toBeNull();
    expect(priced?.currency).toBeNull();
  });
});

describe("FixtureShoppingProvider", () => {
  it("labels every product with its mode and the recorded retrieval time", async () => {
    const cached = new FixtureShoppingProvider("cached");
    const result = await cached.search({ itemKey: "tomato", query: "fresh tomatoes", limit: 3 });
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.every((p) => p.evidence.mode === "cached" && p.evidence.retrievedAt === "2026-09-13T12:00:00.000Z")).toBe(true);
    const fixtureMode = new FixtureShoppingProvider("fixture");
    expect((await fixtureMode.search({ itemKey: "potato", query: "fresh potatoes", limit: 3 })).products[0]?.evidence.mode).toBe("fixture");
    expect((await fixtureMode.search({ itemKey: "saffron", query: "saffron", limit: 3 })).products).toEqual([]);
  });
});

describe("shoppingProviderFromEnv", () => {
  it("is live only with a key, and a fixture provider otherwise", () => {
    expect(shoppingProviderFromEnv({ RESEARCH_MODE: "live" })).toBeNull();
    expect(shoppingProviderFromEnv({ RESEARCH_MODE: "live", PRODUCT_SEARCH_API_KEY: "k" })?.mode).toBe("live");
    expect(shoppingProviderFromEnv({ RESEARCH_MODE: "cached" })?.mode).toBe("cached");
    expect(shoppingProviderFromEnv({ RESEARCH_MODE: "fixture" })?.mode).toBe("fixture");
  });
});
