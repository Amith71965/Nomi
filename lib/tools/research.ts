import type { z } from "zod";
import type { Evidence, Product } from "@/types/contracts";
import type { ShoppingProvider } from "@/lib/integrations/shopping";
import { canonicalEntityKey } from "@/lib/memory/normalize";
import { relevanceScore } from "@/lib/ranking/filter";
import { BEST_MATCH_MIN_COVERAGE, rankProducts, sortByPrice, type RankedProduct } from "@/lib/ranking/score";
import type { compareOptionsArgsSchema, searchProductsArgsSchema } from "@/lib/schemas/tools";

export type SearchProductsArgs = z.infer<typeof searchProductsArgsSchema>;
export type CompareOptionsArgs = z.infer<typeof compareOptionsArgsSchema>;

/** Results kept for the rest of the turn so compare_options and the UI use the same records. */
export interface SearchRecord {
  searchId: string;
  items: Array<{ key: string; label: string }>;
  products: Product[];
  notice: string | null;
  evidence: Evidence[];
}

export interface ResearchContext {
  provider: ShoppingProvider;
  searches: Map<string, SearchRecord>;
  newId: () => string;
  signal?: AbortSignal;
}

export const SEARCHES_PER_TURN_MAX = 2;

/** "tomatoes" → "tomato" for the relevance tables; unknown items fall back to the generic exclusions. */
export function filterKeyFor(itemKey: string): string {
  if (itemKey.endsWith("oes")) return itemKey.slice(0, -2);
  if (itemKey.endsWith("s")) return itemKey.slice(0, -1);
  return itemKey;
}

function label(itemKey: string): string {
  return itemKey.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Plain-language reasons from the signals that were actually present. */
export function reasonFor(r: RankedProduct, ranked: readonly RankedProduct[]): string {
  const p = r.product;
  const parts: string[] = [];
  const comparable = ranked.filter((x) => x.product.normalizedPricePerKg !== null);
  if (p.normalizedPricePerKg !== null && comparable.length >= 2 && comparable.every((x) => (x.product.normalizedPricePerKg ?? Infinity) >= (p.normalizedPricePerKg ?? 0))) {
    parts.push("Lowest listed unit price among comparable listings");
  }
  if (p.priceAmount === null) parts.push("Price not listed");
  else if (p.unitLabel === null) parts.push("Unit size not listed, so per-unit price is unknown");
  if (p.rating !== null && p.reviewCount !== null && p.rating >= 4 && p.reviewCount >= 50) parts.push(`Rated ${p.rating} from ${p.reviewCount} reviews`);
  if (r.coverage < BEST_MATCH_MIN_COVERAGE) parts.push("Limited comparison data");
  if (parts.length === 0) parts.push("Matches your confirmed need");
  return parts.join(" · ");
}

export async function searchProductsTool(args: SearchProductsArgs, ctx: ResearchContext) {
  if (ctx.searches.size >= SEARCHES_PER_TURN_MAX) {
    return { error: "search_budget_exhausted", detail: `At most ${SEARCHES_PER_TURN_MAX} searches per turn.` };
  }
  const searchId = ctx.newId();
  const items: SearchRecord["items"] = [];
  const products: Product[] = [];
  const notices: string[] = [];
  const perItem: Array<{ item_key: string; results: unknown[]; excluded: number }> = [];

  for (const item of args.items.slice(0, 2)) {
    const key = canonicalEntityKey(item.item_key);
    items.push({ key, label: label(key) });
    const result = await ctx.provider.search({ itemKey: key, query: item.query, limit: args.max_results_per_item, signal: ctx.signal });
    const filterKey = filterKeyFor(key);
    const relevant = result.products
      .map((product) => ({ product, relevance: relevanceScore(product.title, filterKey) }))
      .filter((x): x is { product: Product; relevance: number } => x.relevance !== null);
    const ranked = rankProducts(relevant, { profile: "groceries" }).slice(0, args.max_results_per_item);
    const finished = ranked.map((r) => ({ ...r.product, score: Math.round(r.score * 100) / 100, scoreCoverage: Math.round(r.coverage * 100) / 100, reason: reasonFor(r, ranked) }));
    products.push(...finished);
    if (finished.length === 0) notices.push(`No relevant listings were found for ${label(key).toLowerCase()}.`);
    perItem.push({
      item_key: key,
      excluded: result.products.length - relevant.length,
      results: finished.map((p) => ({
        id: p.id,
        title: p.title,
        merchant: p.merchant || null,
        price_usd: p.priceAmount,
        unit: p.unitLabel,
        price_per_kg_usd: p.normalizedPricePerKg,
        rating: p.rating,
        reviews: p.reviewCount,
        availability: p.availability,
        fulfillment: p.fulfillment,
        reason: p.reason,
      })),
    });
  }

  const mode = ctx.provider.mode;
  if (mode !== "live" && products.length > 0) {
    const when = products[0].evidence.retrievedAt.slice(0, 10);
    notices.push(mode === "cached" ? `Cached listings from ${when}; not a live price check.` : `Fixture listings for demonstration; not real prices.`);
  }
  const record: SearchRecord = {
    searchId,
    items,
    products,
    notice: notices.length > 0 ? notices.join(" ") : null,
    evidence: products.map((p) => p.evidence),
  };
  ctx.searches.set(searchId, record);

  return {
    search_id: searchId,
    mode,
    items: perItem,
    notice: record.notice,
    rules: "Fields that are null are unknown; never state them. Availability is unknown for every listing. Pick selected_product_ids only from these ids.",
  };
}

export async function compareOptionsTool(args: CompareOptionsArgs, ctx: ResearchContext) {
  const search = ctx.searches.get(args.search_id);
  if (!search) return { error: "unknown_search", detail: "search_id must come from a search in this turn." };
  const key = canonicalEntityKey(args.item_key);
  const ids = new Set(args.result_ids);
  const candidates = search.products.filter((p) => p.itemKey === key && ids.has(p.id));
  if (candidates.length === 0) return { error: "no_matching_results", detail: "None of the result ids belong to that item in this search." };

  let ordered: Product[];
  let note: string;
  if (args.sort === "price") {
    const { priced, unpriced } = sortByPrice(candidates);
    ordered = [...priced, ...unpriced];
    note =
      priced.length >= 2
        ? `${priced.length} of ${candidates.length} listings have comparable unit prices; the rest are unpriced or lack a unit size and are listed last.`
        : "Fewer than two listings have comparable unit prices, so no price comparison or savings claim is possible.";
  } else {
    ordered = [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    note = ordered.some((p) => (p.scoreCoverage ?? 0) < BEST_MATCH_MIN_COVERAGE) ? "Some listings have limited comparison data; scores reflect only the fields present." : "Ranked by the weighted value score over the fields present.";
  }
  return {
    item_key: key,
    ordered: ordered.map((p) => ({ id: p.id, title: p.title, price_usd: p.priceAmount, price_per_kg_usd: p.normalizedPricePerKg, score: p.score, coverage: p.scoreCoverage, reason: p.reason })),
    note,
  };
}
