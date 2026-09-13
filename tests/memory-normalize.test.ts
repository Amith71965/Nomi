import { describe, expect, it } from "vitest";
import {
  buildEntityKey,
  canonicalEntityKey,
  isValidEntityKey,
  slugify,
  taxonomyGroupFor,
} from "@/lib/memory/normalize";

describe("canonicalEntityKey", () => {
  it("maps the demo plurals to canonical singulars", () => {
    expect(canonicalEntityKey("tomatoes")).toBe("tomato");
    expect(canonicalEntityKey("Tomatoes ")).toBe("tomato");
    expect(canonicalEntityKey("potatoes")).toBe("potato");
    expect(canonicalEntityKey("Potato")).toBe("potato");
  });

  it("keeps running shoes and sports shoes distinct", () => {
    expect(canonicalEntityKey("running shoes")).toBe("running_shoes");
    expect(canonicalEntityKey("Running Shoes")).toBe("running_shoes");
    expect(canonicalEntityKey("sports shoes")).toBe("sports_shoes");
    expect(canonicalEntityKey("running shoes")).not.toBe(canonicalEntityKey("sports shoes"));
  });

  it("lowercases, trims, and slugs unknown entities without inventing aliases", () => {
    expect(canonicalEntityKey("  Chicken Curry ")).toBe("chicken_curry");
    expect(canonicalEntityKey("Garam Masala!")).toBe("garam_masala");
    expect(canonicalEntityKey("crème fraîche")).toBe("creme_fraiche");
  });

  it("is idempotent", () => {
    for (const e of ["tomatoes", "running shoes", "Chicken Curry"]) {
      const once = canonicalEntityKey(e);
      expect(canonicalEntityKey(once)).toBe(once);
    }
  });
});

describe("buildEntityKey", () => {
  it("plan keys carry the local date so different dinner nights never collide", () => {
    expect(buildEntityKey("plan", "chicken curry", { localDate: "2026-09-11" })).toBe("chicken_curry@2026-09-11");
    expect(buildEntityKey("plan", "chicken curry", { localDate: "2026-09-12" })).toBe("chicken_curry@2026-09-12");
  });

  it("plan keys require a local date", () => {
    expect(() => buildEntityKey("plan", "chicken curry")).toThrow("plan_requires_local_date");
    expect(() => buildEntityKey("plan", "chicken curry", { localDate: "tonight" })).toThrow("plan_requires_local_date");
  });

  it("inventory keys never include a date, even if one is supplied", () => {
    expect(buildEntityKey("inventory", "tomatoes", { localDate: "2026-09-11" })).toBe("tomato");
    expect(buildEntityKey("inventory", "tomato@2026-09-11")).toBe("tomato");
  });

  it("rejects empty and over-long keys", () => {
    expect(() => buildEntityKey("inventory", "   ")).toThrow("entity_key_empty");
    expect(() => buildEntityKey("task", "x".repeat(200))).toThrow("entity_key_too_long");
  });
});

describe("slugify / isValidEntityKey", () => {
  it("produces keys that satisfy the DB constraint", () => {
    for (const raw of ["Tomatoes", "running shoes", "buy snacks", "chicken curry@2026-09-11"]) {
      expect(isValidEntityKey(slugify(raw))).toBe(true);
    }
    expect(isValidEntityKey("")).toBe(false);
    expect(isValidEntityKey("Has Caps")).toBe(false);
  });
});

describe("taxonomyGroupFor", () => {
  it("places the demo vegetables and leaves unknown keys ungrouped", () => {
    expect(taxonomyGroupFor("tomato")).toBe("vegetables");
    expect(taxonomyGroupFor("potato")).toBe("vegetables");
    expect(taxonomyGroupFor("running_shoes")).toBeNull();
  });
});
