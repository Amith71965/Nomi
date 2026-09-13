import type { MemoryRecord } from "@/types/contracts";
import { GROCERY_TAXONOMY } from "@/lib/memory/normalize";
import { localDateString } from "@/lib/time";

/**
 * Intent-scoped retrieval over already-loaded active records. No embeddings:
 * category + freshness + a tiny taxonomy. The result is what the orchestrator
 * preloads before the model call (at most 30 rows).
 */

export type RetrievalIntent = "today" | "vegetables" | "groceries" | "shopping_interest" | "all";

export const RETRIEVAL_LIMIT = 30;
export const STALE_INVENTORY_DAYS = 7;

export interface RetrievalContext {
  intent: RetrievalIntent;
  now: Date;
  timeZone: string;
}

export interface RetrievedMemories {
  /** Inventory rows the user said are out/low, fresh enough to use as current shortages. */
  needs: MemoryRecord[];
  /** Inventory older than STALE_INVENTORY_DAYS: ask "still out?" before treating as a shortage. */
  staleInventory: MemoryRecord[];
  /** Plans whose local date is today (in the confirmed zone). */
  plansToday: MemoryRecord[];
  /** Active tasks. */
  tasks: MemoryRecord[];
  /** Ongoing interests, always presented separately from today's needs. */
  interests: MemoryRecord[];
  preferences: MemoryRecord[];
  /** Everything that made the cut, ordered by recency, capped at RETRIEVAL_LIMIT. */
  context: MemoryRecord[];
}

const VEGETABLE_KEYS = new Set([...GROCERY_TAXONOMY.vegetables, ...GROCERY_TAXONOMY.fruit]);
const GROCERY_KEYS = new Set(Object.values(GROCERY_TAXONOMY).flat());

export function selectRelevant(records: readonly MemoryRecord[], ctx: RetrievalContext): RetrievedMemories {
  const nowMs = ctx.now.getTime();
  const today = localDateString(ctx.now, ctx.timeZone);
  const staleBefore = nowMs - STALE_INVENTORY_DAYS * 86_400_000;

  const active = records
    .filter((r) => r.status === "active")
    .filter((r) => r.expiresAt === null || Date.parse(r.expiresAt) > nowMs)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const inventory = active.filter((r) => r.category === "inventory" && isShortage(r));
  const fresh = inventory.filter((r) => Date.parse(r.updatedAt) >= staleBefore);
  const stale = inventory.filter((r) => Date.parse(r.updatedAt) < staleBefore);

  const scopeInventory = (rows: MemoryRecord[]): MemoryRecord[] => {
    if (ctx.intent === "vegetables") return rows.filter((r) => VEGETABLE_KEYS.has(r.entityKey));
    if (ctx.intent === "groceries") return rows.filter((r) => GROCERY_KEYS.has(r.entityKey) || true);
    return rows;
  };

  const needs = ctx.intent === "shopping_interest" ? [] : scopeInventory(fresh);
  const staleInventory = ctx.intent === "shopping_interest" ? [] : scopeInventory(stale);
  const plansToday = active.filter((r) => r.category === "plan" && r.value.local_date === today);
  const tasks = ctx.intent === "shopping_interest" ? [] : active.filter((r) => r.category === "task");
  const interests = active.filter((r) => r.category === "shopping_interest");
  const preferences = active.filter((r) => r.category === "preference");

  const ordered = dedupe([
    ...needs,
    ...plansToday,
    ...tasks,
    ...(ctx.intent === "today" || ctx.intent === "all" || ctx.intent === "shopping_interest" ? interests : []),
    ...preferences,
    ...staleInventory,
  ]).slice(0, RETRIEVAL_LIMIT);

  return { needs, staleInventory, plansToday, tasks, interests, preferences, context: ordered };
}

function isShortage(r: MemoryRecord): boolean {
  const a = r.value.availability;
  return a === "out" || a === "low";
}

function dedupe(rows: MemoryRecord[]): MemoryRecord[] {
  const seen = new Set<string>();
  const out: MemoryRecord[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}
