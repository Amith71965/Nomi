/**
 * Relevance filter for fresh produce. A cheap irrelevant listing must never
 * outrank a relevant one, so exclusion happens before scoring.
 */

const GENERIC_EXCLUSIONS = [
  "seed",
  "seeds",
  "seedling",
  "seedlings",
  "plant",
  "plants",
  "sapling",
  "starter",
  "grow kit",
  "growing kit",
  "food service",
  "foodservice",
  "bulk case",
  "wholesale",
  "artificial",
  "faux",
  "decor",
  "toy",
  "costume",
  "keychain",
  "sticker",
  "print",
  "poster",
] as const;

const ITEM_EXCLUSIONS: Readonly<Record<string, readonly string[]>> = {
  tomato: ["ketchup", "canned", "can of", "sauce", "paste", "puree", "purée", "sun-dried", "sun dried", "dried", "powder", "soup", "juice", "salsa", "chutney", "seed"],
  potato: ["chips", "crisps", "fries", "flakes", "starch", "flour", "powder", "canned", "mash mix", "instant", "vodka", "seed potato", "seed"],
  onion: ["powder", "flakes", "rings", "fried", "pickled", "dried", "seed"],
  garlic: ["powder", "minced jar", "paste", "supplement", "capsule", "oil"],
};

const ITEM_REQUIRED_TERMS: Readonly<Record<string, readonly string[]>> = {
  tomato: ["tomato"],
  potato: ["potato"],
  onion: ["onion"],
  garlic: ["garlic"],
};

export interface RelevanceVerdict {
  relevant: boolean;
  /** Which exclusion term or missing required term decided the verdict. */
  reason: string | null;
}

export function isRelevantFreshProduce(title: string, itemKey: string): RelevanceVerdict {
  const t = title.toLowerCase();

  const required = ITEM_REQUIRED_TERMS[itemKey];
  if (required && !required.some((term) => t.includes(term))) {
    return { relevant: false, reason: `missing:${required[0]}` };
  }

  for (const term of GENERIC_EXCLUSIONS) {
    if (matchesTerm(t, term)) return { relevant: false, reason: `excluded:${term}` };
  }
  for (const term of ITEM_EXCLUSIONS[itemKey] ?? []) {
    if (matchesTerm(t, term)) return { relevant: false, reason: `excluded:${term}` };
  }
  return { relevant: true, reason: null };
}

/** Deterministic relevance in 0..1: 1 when the required term is present and it looks fresh, else 0.6 baseline. */
export function relevanceScore(title: string, itemKey: string): number | null {
  const verdict = isRelevantFreshProduce(title, itemKey);
  if (!verdict.relevant) return null;
  const t = title.toLowerCase();
  const freshHints = ["fresh", "organic", "lb", "pound", "kg", "each", "bag", "bunch", "vine", "roma", "russet", "yukon", "gold", "red"];
  return freshHints.some((h) => t.includes(h)) ? 1 : 0.6;
}

function matchesTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(haystack);
}
