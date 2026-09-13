import type { DataMode, Product } from "@/types/contracts";
import cached from "@/fixtures/shopping-cached.json";
import { ApiError } from "@/lib/errors";
import { parsePrice, parseUnit, pricePerKg } from "@/lib/ranking/normalize";
import { serpApiListingSchema, serpApiShoppingResponseSchema, shoppingFixtureSchema, type SerpApiListing } from "@/lib/schemas/shopping";

/**
 * Grocery research provider. Fixed provider (SerpApi Google Shopping), fixed
 * URL, no arbitrary fetch. Every field that the listing does not state stays
 * null; the mode travels with each product so the UI can label it.
 */

export const SERPAPI_URL = "https://serpapi.com/search.json";
export const SOURCE_NAME = "Google Shopping via SerpApi";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ShoppingSearchInput {
  /** Canonical item key the results belong to (e.g. "tomatoes"). */
  itemKey: string;
  query: string;
  limit: number;
  signal?: AbortSignal;
}

export interface ShoppingSearchResult {
  products: Product[];
  searchUrl: string;
  retrievedAt: string;
  mode: DataMode;
}

export interface ShoppingProvider {
  readonly mode: DataMode;
  search(input: ShoppingSearchInput): Promise<ShoppingSearchResult>;
}

function httpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function fulfillmentFrom(delivery: string | undefined): Product["fulfillment"] {
  if (!delivery) return "unknown";
  const d = delivery.toLowerCase();
  const del = d.includes("deliver") || d.includes("shipping");
  const pick = d.includes("pickup") || d.includes("pick up") || d.includes("in store") || d.includes("in-store");
  if (del && pick) return "both";
  if (del) return "delivery";
  if (pick) return "pickup";
  return "unknown";
}

/** One raw listing → one nullable Product. Returns null when there is nowhere honest to send the user. */
export function toProduct(
  listing: SerpApiListing,
  ctx: { id: string; itemKey: string; retrievedAt: string; mode: DataMode; searchUrl: string },
): Product | null {
  const merchantLink = httpUrl(listing.link);
  const googleLink = httpUrl(listing.product_link);
  const destination = merchantLink ?? googleLink;
  if (!destination) return null;
  const isGoogle = (url: string) => /(^|\.)google\.[a-z.]+$/i.test(new URL(url).hostname);

  const price = listing.extracted_price ?? parsePrice(listing.price);
  const unit = parseUnit(listing.title);
  return {
    id: ctx.id,
    itemKey: ctx.itemKey,
    title: listing.title.slice(0, 300),
    imageUrl: httpUrl(listing.thumbnail),
    merchant: (listing.source ?? "").slice(0, 120),
    priceAmount: price,
    currency: price !== null ? "USD" : null,
    unitLabel: unit.label,
    normalizedPricePerKg: pricePerKg(price, unit.quantityKg),
    rating: typeof listing.rating === "number" && listing.rating >= 0 && listing.rating <= 5 ? listing.rating : null,
    reviewCount: typeof listing.reviews === "number" && listing.reviews >= 0 ? Math.round(listing.reviews) : null,
    availability: "unknown",
    fulfillment: fulfillmentFrom(listing.delivery),
    distanceKm: null,
    deliveryMinutes: null,
    destinationUrl: destination,
    destinationKind: isGoogle(destination) ? "search_listing" : "merchant",
    reason: "",
    score: null,
    scoreCoverage: 0,
    evidence: { sourceUrl: ctx.searchUrl, sourceName: SOURCE_NAME, retrievedAt: ctx.retrievedAt, mode: ctx.mode },
  };
}

function parseListings(raw: unknown[]): SerpApiListing[] {
  const out: SerpApiListing[] = [];
  for (const item of raw) {
    const parsed = serpApiListingSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// ── Live provider ───────────────────────────────────────────────────────────

export class SerpApiShoppingProvider implements ShoppingProvider {
  readonly mode: DataMode = "live";
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: { apiKey: string; location: string | null; fetchImpl?: FetchLike; now?: () => Date; timeoutMs?: number }) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  requestUrl(query: string, limit: number): URL {
    const url = new URL(SERPAPI_URL);
    url.searchParams.set("engine", "google_shopping");
    url.searchParams.set("q", query);
    url.searchParams.set("gl", "us");
    url.searchParams.set("hl", "en");
    url.searchParams.set("num", String(Math.min(Math.max(limit, 1), 20)));
    if (this.options.location) url.searchParams.set("location", this.options.location);
    url.searchParams.set("api_key", this.options.apiKey);
    return url;
  }

  async search(input: ShoppingSearchInput): Promise<ShoppingSearchResult> {
    const url = this.requestUrl(input.query, Math.max(input.limit * 3, 10));
    let res: Response;
    try {
      res = await this.fetchImpl(url.toString(), { signal: input.signal ?? AbortSignal.timeout(this.options.timeoutMs ?? 12_000) });
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") throw new ApiError("deadline_exceeded", "Product search took too long.", { cause });
      throw new ApiError("provider_unavailable", "Could not reach the product search provider.", { cause });
    }
    const raw: unknown = await res.json().catch(() => null);
    if (res.status === 401 || res.status === 403) throw new ApiError("provider_error", "Product search rejected the credentials.", { retryable: false });
    if (res.status === 429) throw new ApiError("rate_limited", "Product search is rate limiting requests.");
    if (!res.ok) throw new ApiError("provider_error", "Product search returned an error.", { details: { status: res.status } });
    const parsed = serpApiShoppingResponseSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError("provider_error", "Unexpected product search response.");
    if (parsed.data.error) throw new ApiError("provider_error", "Product search returned an error.", { details: { providerMessage: parsed.data.error } });

    const retrievedAt = (this.options.now ?? (() => new Date()))().toISOString();
    const searchUrl = httpUrl(parsed.data.search_metadata?.google_shopping_url) ?? `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(input.query)}`;
    const listings = parseListings(parsed.data.shopping_results ?? []);
    const products = listings
      .map((l, i) => toProduct(l, { id: `${input.itemKey}_${i + 1}`, itemKey: input.itemKey, retrievedAt, mode: "live", searchUrl }))
      .filter((p): p is Product => p !== null);
    return { products, searchUrl, retrievedAt, mode: "live" };
  }
}

// ── Cached / fixture provider ───────────────────────────────────────────────

export class FixtureShoppingProvider implements ShoppingProvider {
  private readonly data = shoppingFixtureSchema.parse(cached);

  constructor(readonly mode: Exclude<DataMode, "live">) {}

  async search(input: ShoppingSearchInput): Promise<ShoppingSearchResult> {
    const entry =
      this.data.searches[input.itemKey] ?? this.data.searches[`${input.itemKey}es`] ?? this.data.searches[`${input.itemKey}s`] ?? null;
    const retrievedAt = new Date(this.data.retrievedAt).toISOString();
    if (!entry) {
      return { products: [], searchUrl: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(input.query)}`, retrievedAt, mode: this.mode };
    }
    const products = entry.listings
      .map((l, i) => toProduct(l, { id: `${input.itemKey}_${i + 1}`, itemKey: input.itemKey, retrievedAt, mode: this.mode, searchUrl: entry.searchUrl }))
      .filter((p): p is Product => p !== null);
    return { products, searchUrl: entry.searchUrl, retrievedAt, mode: this.mode };
  }
}

/** Provider for the configured RESEARCH_MODE, or null when live mode has no key. */
export function shoppingProviderFromEnv(env: { RESEARCH_MODE: DataMode; PRODUCT_SEARCH_API_KEY?: string; PRODUCT_SEARCH_LOCATION?: string }): ShoppingProvider | null {
  if (env.RESEARCH_MODE !== "live") return new FixtureShoppingProvider(env.RESEARCH_MODE);
  if (!env.PRODUCT_SEARCH_API_KEY) return null;
  return new SerpApiShoppingProvider({ apiKey: env.PRODUCT_SEARCH_API_KEY, location: env.PRODUCT_SEARCH_LOCATION ?? null });
}
