import type { Product } from "@/types/contracts";

/**
 * Deterministic ranking. Filter first, then score. Missing evidence contributes
 * zero and lowers coverage; it is never imputed. No external dependency.
 */

export interface Signal {
  weight: number;
  value: number | null; // 0..1 or null when unobserved
}

export interface ScoreResult {
  /** 0..100, rounded. */
  score: number;
  /** Sum of weights whose value was observed, 0..1. */
  coverage: number;
}

export function score(signals: readonly Signal[]): ScoreResult {
  const coverage = signals.reduce((s, x) => s + (x.value === null ? 0 : x.weight), 0);
  const raw = signals.reduce((s, x) => s + x.weight * clamp01(x.value ?? 0), 0);
  return { score: Math.round(100 * raw), coverage: round3(coverage) };
}

export type RankingProfile = "general" | "groceries" | "fashion";

export interface Weights {
  relevance: number;
  price: number;
  reviews: number;
  convenience: number;
  confidence: number;
}

export const WEIGHTS: Readonly<Record<RankingProfile, Weights>> = {
  general: { relevance: 0.3, price: 0.25, reviews: 0.2, convenience: 0.15, confidence: 0.1 },
  groceries: { relevance: 0.3, price: 0.3, reviews: 0.1, convenience: 0.2, confidence: 0.1 },
  fashion: { relevance: 0.35, price: 0.25, reviews: 0.15, convenience: 0.15, confidence: 0.1 },
};

/** Groceries convenience splits into distance 10%, delivery 5%, fulfillment 5% when observed. */
export const GROCERY_CONVENIENCE_SPLIT = { distance: 0.1, delivery: 0.05, fulfillment: 0.05 } as const;

export const BEST_MATCH_MIN_COVERAGE = 0.6;

// ── Signal normalizers (each returns null when the evidence is absent) ──────

/** `value = minUnitPrice / candidateUnitPrice`, clamped. All equal prices → 1. */
export function priceValueSignal(candidateUnitPrice: number | null, minUnitPrice: number | null): number | null {
  if (candidateUnitPrice === null || minUnitPrice === null) return null;
  if (candidateUnitPrice <= 0 || minUnitPrice <= 0) return null;
  return clamp01(minUnitPrice / candidateUnitPrice);
}

/** `(rating/5) * min(1, log10(1+count)/2)`. Without a count the rating is unsupported → null. */
export function reviewSignal(rating: number | null, reviewCount: number | null): number | null {
  if (rating === null || reviewCount === null) return null;
  if (rating < 0 || rating > 5 || reviewCount < 0) return null;
  return clamp01((rating / 5) * Math.min(1, Math.log10(1 + reviewCount) / 2));
}

export function distanceSignal(distanceKm: number | null): number | null {
  if (distanceKm === null || distanceKm < 0) return null;
  return clamp01(1 - distanceKm / 10);
}

export function deliverySignal(deliveryMinutes: number | null): number | null {
  if (deliveryMinutes === null || deliveryMinutes < 0) return null;
  return clamp01(1 - deliveryMinutes / 120);
}

export function fulfillmentSignal(
  observed: Product["fulfillment"],
  wanted: "pickup" | "delivery" | null,
): number | null {
  if (observed === "unknown" || wanted === null) return null;
  if (observed === "both") return 1;
  return observed === wanted ? 1 : 0;
}

/** Evidence completeness rubric: fraction of key fields that are present. Not a trust score. */
export function confidenceSignal(p: Pick<Product, "priceAmount" | "unitLabel" | "merchant" | "availability" | "imageUrl">): number {
  const checks = [
    p.priceAmount !== null,
    p.unitLabel !== null,
    p.merchant.trim().length > 0,
    p.availability !== "unknown",
    p.imageUrl !== null,
  ];
  return round3(checks.filter(Boolean).length / checks.length);
}

// ── Product ranking ─────────────────────────────────────────────────────────

export interface RankInput {
  product: Product;
  /** Deterministic relevance 0..1 from required-attribute matches, or null if unestablished. */
  relevance: number | null;
}

export interface RankedProduct {
  product: Product;
  score: number;
  coverage: number;
  relevanceEstablished: boolean;
}

export interface RankOptions {
  profile?: RankingProfile;
  wantedFulfillment?: "pickup" | "delivery" | null;
}

/**
 * Rank products of ONE item key. Unit prices are compared only within the
 * candidates that carry an explicit `normalizedPricePerKg`.
 */
export function rankProducts(inputs: readonly RankInput[], options: RankOptions = {}): RankedProduct[] {
  const profile = options.profile ?? "groceries";
  const w = WEIGHTS[profile];
  const wanted = options.wantedFulfillment ?? null;

  const unitPrices = inputs
    .map((i) => i.product.normalizedPricePerKg)
    .filter((v): v is number => v !== null && v > 0);
  const minUnit = unitPrices.length > 0 ? Math.min(...unitPrices) : null;

  const ranked = inputs.map(({ product, relevance }) => {
    const signals: Signal[] = [
      { weight: w.relevance, value: relevance },
      { weight: w.price, value: priceValueSignal(product.normalizedPricePerKg, minUnit) },
      { weight: w.reviews, value: reviewSignal(product.rating, product.reviewCount) },
    ];
    if (profile === "groceries") {
      signals.push(
        { weight: GROCERY_CONVENIENCE_SPLIT.distance, value: distanceSignal(product.distanceKm) },
        { weight: GROCERY_CONVENIENCE_SPLIT.delivery, value: deliverySignal(product.deliveryMinutes) },
        { weight: GROCERY_CONVENIENCE_SPLIT.fulfillment, value: fulfillmentSignal(product.fulfillment, wanted) },
      );
    } else {
      const conv = [distanceSignal(product.distanceKm), deliverySignal(product.deliveryMinutes)].filter(
        (v): v is number => v !== null,
      );
      signals.push({ weight: w.convenience, value: conv.length ? conv.reduce((a, b) => a + b, 0) / conv.length : null });
    }
    signals.push({ weight: w.confidence, value: confidenceSignal(product) });

    const s = score(signals);
    return { product, score: s.score, coverage: s.coverage, relevanceEstablished: relevance !== null };
  });

  return ranked.sort((a, b) => b.score - a.score || b.coverage - a.coverage || a.product.id.localeCompare(b.product.id));
}

export type RecommendationLabel = "best_supported_match" | "limited_comparison_data";

export function recommendationLabel(r: Pick<RankedProduct, "coverage" | "relevanceEstablished">): RecommendationLabel {
  return r.coverage >= BEST_MATCH_MIN_COVERAGE && r.relevanceEstablished ? "best_supported_match" : "limited_comparison_data";
}

/** Two listings are price-comparable only with the same currency and an explicit unit price. */
export function isPriceComparable(a: Product, b: Product): boolean {
  return (
    a.itemKey === b.itemKey &&
    a.currency !== null &&
    a.currency === b.currency &&
    a.normalizedPricePerKg !== null &&
    b.normalizedPricePerKg !== null
  );
}

/** Percent saved buying `cheaper` instead of `reference`, or null when not comparable. */
export function savingsPercent(cheaper: Product, reference: Product): number | null {
  if (!isPriceComparable(cheaper, reference)) return null;
  const c = cheaper.normalizedPricePerKg as number;
  const r = reference.normalizedPricePerKg as number;
  if (r <= 0 || c > r) return null;
  return Math.round(((r - c) / r) * 100);
}

/** Ascending by unit price among comparable priced listings; unpriced listings are returned separately. */
export function sortByPrice(products: readonly Product[]): { priced: Product[]; unpriced: Product[] } {
  const priced = products
    .filter((p) => p.normalizedPricePerKg !== null && p.currency !== null)
    .sort((a, b) => (a.normalizedPricePerKg as number) - (b.normalizedPricePerKg as number));
  const unpriced = products.filter((p) => p.normalizedPricePerKg === null || p.currency === null);
  return { priced, unpriced };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
