import { describe, expect, it } from "vitest";
import type { Product } from "@/types/contracts";
import {
  BEST_MATCH_MIN_COVERAGE,
  WEIGHTS,
  confidenceSignal,
  deliverySignal,
  distanceSignal,
  fulfillmentSignal,
  isPriceComparable,
  priceValueSignal,
  rankProducts,
  recommendationLabel,
  reviewSignal,
  savingsPercent,
  score,
  sortByPrice,
} from "@/lib/ranking/score";

function product(overrides: Partial<Product> & { id: string }): Product {
  return {
    itemKey: "tomato",
    title: "Fresh tomatoes",
    imageUrl: null,
    merchant: "Store",
    priceAmount: null,
    currency: null,
    unitLabel: null,
    normalizedPricePerKg: null,
    rating: null,
    reviewCount: null,
    availability: "unknown",
    fulfillment: "unknown",
    distanceKm: null,
    deliveryMinutes: null,
    destinationUrl: "https://example.com/x",
    destinationKind: "search_listing",
    reason: "",
    score: null,
    scoreCoverage: 0,
    evidence: { sourceUrl: "https://example.com/s", sourceName: "Ex", retrievedAt: "2026-09-11T14:00:00-04:00", mode: "fixture" },
    ...overrides,
  };
}

describe("score", () => {
  it("missing evidence contributes zero and lowers coverage instead of being imputed", () => {
    const r = score([
      { weight: 0.5, value: 1 },
      { weight: 0.5, value: null },
    ]);
    expect(r).toEqual({ score: 50, coverage: 0.5 });
  });

  it("full evidence at 1 scores 100 with coverage 1", () => {
    expect(score([{ weight: 0.6, value: 1 }, { weight: 0.4, value: 1 }])).toEqual({ score: 100, coverage: 1 });
  });

  it("weights in every profile sum to 1", () => {
    for (const w of Object.values(WEIGHTS)) {
      const sum = w.relevance + w.price + w.reviews + w.convenience + w.confidence;
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });
});

describe("signal normalizers", () => {
  it("price value is minUnit / candidate, equal prices give 1, missing gives null", () => {
    expect(priceValueSignal(4.0, 3.28)).toBeCloseTo(0.82, 2);
    expect(priceValueSignal(3.28, 3.28)).toBe(1);
    expect(priceValueSignal(null, 3.28)).toBeNull();
    expect(priceValueSignal(3.28, null)).toBeNull();
    expect(priceValueSignal(0, 1)).toBeNull();
  });

  it("reviews require both rating and count", () => {
    expect(reviewSignal(4.5, null)).toBeNull();
    expect(reviewSignal(null, 100)).toBeNull();
    expect(reviewSignal(5, 99)).toBeCloseTo(1, 5); // log10(100)/2 = 1
    expect(reviewSignal(5, 9)).toBeCloseTo(0.5, 5); // log10(10)/2 = 0.5
  });

  it("distance and delivery decay linearly and clamp", () => {
    expect(distanceSignal(0)).toBe(1);
    expect(distanceSignal(5)).toBe(0.5);
    expect(distanceSignal(20)).toBe(0);
    expect(distanceSignal(null)).toBeNull();
    expect(deliverySignal(60)).toBe(0.5);
    expect(deliverySignal(200)).toBe(0);
    expect(deliverySignal(null)).toBeNull();
  });

  it("fulfillment is 1 on match, 0 on explicit mismatch, null when unknown", () => {
    expect(fulfillmentSignal("pickup", "pickup")).toBe(1);
    expect(fulfillmentSignal("both", "delivery")).toBe(1);
    expect(fulfillmentSignal("pickup", "delivery")).toBe(0);
    expect(fulfillmentSignal("unknown", "delivery")).toBeNull();
    expect(fulfillmentSignal("pickup", null)).toBeNull();
  });

  it("confidence counts present fields, it is not a trust score", () => {
    expect(confidenceSignal(product({ id: "a" }))).toBe(0.2); // merchant only
    expect(
      confidenceSignal(product({ id: "b", priceAmount: 1, unitLabel: "1 lb", availability: "in_stock", imageUrl: "https://x/y.png" })),
    ).toBe(1);
  });
});

describe("rankProducts", () => {
  it("a low-priced listing cannot outrank a relevant one when relevance is unestablished", () => {
    const cheapIrrelevant = product({ id: "cheap", normalizedPricePerKg: 1, priceAmount: 1, currency: "USD", unitLabel: "1 kg" });
    const relevant = product({ id: "rel", normalizedPricePerKg: 4, priceAmount: 4, currency: "USD", unitLabel: "1 kg" });
    const ranked = rankProducts([
      { product: cheapIrrelevant, relevance: null },
      { product: relevant, relevance: 1 },
    ]);
    expect(ranked[0]?.product.id).toBe("rel");
  });

  it("a null price never yields a cheapest badge and does not enter unit-price comparison", () => {
    const priced = product({ id: "p", normalizedPricePerKg: 4, priceAmount: 4, currency: "USD", unitLabel: "1 kg" });
    const unpriced = product({ id: "u" });
    const ranked = rankProducts([
      { product: unpriced, relevance: 1 },
      { product: priced, relevance: 1 },
    ]);
    const u = ranked.find((r) => r.product.id === "u");
    expect(u?.coverage).toBeLessThan(ranked.find((r) => r.product.id === "p")?.coverage ?? 0);
    expect(sortByPrice([priced, unpriced])).toEqual({ priced: [priced], unpriced: [unpriced] });
  });

  it("labels best_supported_match only at coverage >= 0.6 with relevance established", () => {
    expect(recommendationLabel({ coverage: BEST_MATCH_MIN_COVERAGE, relevanceEstablished: true })).toBe("best_supported_match");
    expect(recommendationLabel({ coverage: 0.59, relevanceEstablished: true })).toBe("limited_comparison_data");
    expect(recommendationLabel({ coverage: 0.9, relevanceEstablished: false })).toBe("limited_comparison_data");
  });

  it("is deterministic: ties break by coverage then id", () => {
    const a = product({ id: "a" });
    const b = product({ id: "b" });
    const r1 = rankProducts([{ product: a, relevance: 1 }, { product: b, relevance: 1 }]);
    const r2 = rankProducts([{ product: b, relevance: 1 }, { product: a, relevance: 1 }]);
    expect(r1.map((r) => r.product.id)).toEqual(r2.map((r) => r.product.id));
  });
});

describe("savings and comparability", () => {
  it("computes the documented hypothetical: $3.28 vs $4.00 identical quantity = 18%", () => {
    const cheaper = product({ id: "c", normalizedPricePerKg: 3.28, currency: "USD" });
    const reference = product({ id: "r", normalizedPricePerKg: 4.0, currency: "USD" });
    expect(savingsPercent(cheaper, reference)).toBe(18);
  });

  it("refuses savings across items, currencies, or missing unit prices", () => {
    const c = product({ id: "c", normalizedPricePerKg: 3.28, currency: "USD" });
    expect(savingsPercent(c, product({ id: "r", itemKey: "potato", normalizedPricePerKg: 4, currency: "USD" }))).toBeNull();
    expect(savingsPercent(c, product({ id: "r", normalizedPricePerKg: 4, currency: null }))).toBeNull();
    expect(savingsPercent(c, product({ id: "r", normalizedPricePerKg: null, currency: "USD" }))).toBeNull();
    expect(isPriceComparable(c, product({ id: "r" }))).toBe(false);
  });

  it("never reports negative savings", () => {
    const pricier = product({ id: "c", normalizedPricePerKg: 5, currency: "USD" });
    const reference = product({ id: "r", normalizedPricePerKg: 4, currency: "USD" });
    expect(savingsPercent(pricier, reference)).toBeNull();
  });
});
