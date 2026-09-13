import type { Category } from "@/types/contracts";

/**
 * Canonical memory keys. Explicit, small, and deterministic: no stemming
 * library, no embeddings. Unknown words pass through lowercased.
 */

/** Plural / variant → canonical singular key. Only entries we have decided on. */
export const ENTITY_ALIASES: Readonly<Record<string, string>> = {
  tomatoes: "tomato",
  tomatos: "tomato",
  potatoes: "potato",
  potatos: "potato",
  onions: "onion",
  eggs: "egg",
  apples: "apple",
  bananas: "banana",
  carrots: "carrot",
  lemons: "lemon",
  limes: "lime",
  chillies: "chilli",
  chilies: "chilli",
  chili: "chilli",
  chiles: "chilli",
  garlic_cloves: "garlic",
  "running shoes": "running_shoes",
  "running shoe": "running_shoes",
  sneakers: "running_shoes",
  "sports shoes": "sports_shoes",
  "sport shoes": "sports_shoes",
  snack: "snacks",
};

export const ENTITY_KEY_MAX = 160;

/** Lowercase, trim, collapse whitespace to `_`, strip anything outside [a-z0-9_@.-]. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_@.-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Apply the alias dictionary on the raw phrase first, then on the slug. */
export function canonicalEntityKey(entity: string): string {
  const raw = entity.toLowerCase().trim().replace(/\s+/g, " ");
  const direct = ENTITY_ALIASES[raw];
  if (direct) return direct;
  const slug = slugify(raw);
  return ENTITY_ALIASES[slug] ?? slug;
}

export interface BuildKeyOptions {
  /** Required for `plan` keys so two dinner plans on different days never collide. */
  localDate?: string;
}

/**
 * Build the unique `(category, entity_key)` for a memory.
 * Plans include the resolved local date (`chicken_curry@2026-09-11`); inventory never does.
 */
export function buildEntityKey(category: Category, entity: string, options: BuildKeyOptions = {}): string {
  const base = canonicalEntityKey(entity);
  if (base.length === 0) throw new Error("entity_key_empty");

  let key: string;
  switch (category) {
    case "plan": {
      if (!options.localDate || !/^\d{4}-\d{2}-\d{2}$/.test(options.localDate)) {
        throw new Error("plan_requires_local_date");
      }
      key = `${base.replace(/@.*$/, "")}@${options.localDate}`;
      break;
    }
    case "inventory":
    case "shopping_interest":
    case "task":
    case "preference":
      key = base.replace(/@.*$/, "");
      break;
  }

  if (key.length > ENTITY_KEY_MAX) throw new Error("entity_key_too_long");
  return key;
}

export function isValidEntityKey(key: string): boolean {
  return key.length >= 1 && key.length <= ENTITY_KEY_MAX && /^[a-z0-9_@.-]+$/.test(key);
}

/** Tiny grocery taxonomy used for "what vegetables?"-style retrieval. Not a catalog. */
export const GROCERY_TAXONOMY: Readonly<Record<string, readonly string[]>> = {
  vegetables: ["tomato", "potato", "onion", "garlic", "ginger", "carrot", "spinach", "chilli", "capsicum", "pepper"],
  fruit: ["apple", "banana", "lemon", "lime"],
  dairy: ["milk", "yogurt", "butter", "cheese", "cream", "egg"],
  pantry: ["rice", "flour", "oil", "salt", "sugar", "spices", "curry_powder", "garam_masala", "turmeric", "cumin"],
  protein: ["chicken", "fish", "tofu", "lentils", "chickpeas"],
  snacks: ["snacks", "chips", "biscuits", "nuts"],
};

export function taxonomyGroupFor(entityKey: string): string | null {
  for (const [group, keys] of Object.entries(GROCERY_TAXONOMY)) {
    if (keys.includes(entityKey)) return group;
  }
  return null;
}
