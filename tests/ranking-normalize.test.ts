import { describe, expect, it } from "vitest";
import { parsePrice, parseUnit, pricePerKg } from "@/lib/ranking/normalize";

describe("unit normalization", () => {
  it("derives per-kg only from an explicit weight", () => {
    expect(parseUnit("Russet Potatoes 5 lb bag")).toEqual({ quantityKg: 5 / 2.20462, label: "5 lb" });
    expect(parseUnit("Cherry Tomatoes 10 oz")).toMatchObject({ label: "10 oz" });
    expect(parseUnit("Onions 1.5 kg")).toEqual({ quantityKg: 1.5, label: "1.5 kg" });
    expect(parseUnit("Garlic 250g")).toEqual({ quantityKg: 0.25, label: "250 g" });
    expect(parseUnit("Organic Red Potatoes, each")).toEqual({ quantityKg: null, label: "each" });
    expect(parseUnit("Fresh Tomatoes on the Vine")).toEqual({ quantityKg: null, label: null });
  });

  it("never turns a missing price or weight into a number, and 1 lb vs 5 lb become comparable per kg", () => {
    expect(pricePerKg(null, 1)).toBeNull();
    expect(pricePerKg(1.99, null)).toBeNull();
    expect(pricePerKg(0, 1)).toBeNull();
    const oneLb = pricePerKg(1.99, parseUnit("Roma Tomatoes 1 lb").quantityKg);
    const fiveLb = pricePerKg(5.49, parseUnit("Roma Tomatoes 5 lb").quantityKg);
    expect(oneLb).toBeCloseTo(4.39, 1);
    expect(fiveLb).toBeCloseTo(2.42, 1);
    expect((fiveLb ?? 0) < (oneLb ?? 0)).toBe(true);
  });

  it("parses price strings and rejects junk", () => {
    expect(parsePrice("$2.99")).toBe(2.99);
    expect(parsePrice("$1,249.00")).toBe(1249);
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice("Call for price")).toBeNull();
  });
});
