import type { Category, MemorySource, MemoryStatus } from "@/types/contracts";
import { z } from "zod";
import { MEMORY_MIN_CONFIDENCE, MemoryService, type MemoryChange } from "@/lib/memory/service";
import { buildEntityKey, canonicalEntityKey } from "@/lib/memory/normalize";
import type { MemoryUpsertEntry } from "@/lib/memory/store";
import type { createMemoryArgsSchema, getMemoriesArgsSchema, updateMemoryArgsSchema } from "@/lib/schemas/tools";
import { addMinutes, localDateString, nextLocalMidnight, parseLocalDate, parseRfc3339, toRfc3339 } from "@/lib/time";

export type GetMemoriesArgs = z.infer<typeof getMemoriesArgsSchema>;
export type CreateMemoryArgs = z.infer<typeof createMemoryArgsSchema>;
export type UpdateMemoryArgs = z.infer<typeof updateMemoryArgsSchema>;
export type FlatValue = CreateMemoryArgs["entries"][number]["value"];

export interface MemoryToolContext {
  userId: string;
  turnId: string;
  /** The newest user input. Every saved quote must come from here. */
  inputText: string;
  now: Date;
  timeZone: string;
  source: MemorySource;
  memory: MemoryService;
}

export interface MemoryToolOutcome {
  changes: MemoryChange[];
  skipped: Array<{ entity: string; reason: string }>;
}

/** The quote must appear in the user's newest message (case- and whitespace-insensitive). */
export function quoteIsFromInput(quote: string, input: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  const q = norm(quote);
  return q.length > 0 && norm(input).includes(q);
}

/** Server-side expiry defaults by category. The model may propose one, but only a valid RFC3339 value is honoured. */
export function defaultExpiry(category: Category, now: Date, timeZone: string): string | null {
  switch (category) {
    case "plan":
      return toRfc3339(nextLocalMidnight(now, timeZone), timeZone);
    case "shopping_interest":
      return toRfc3339(addMinutes(now, 30 * 24 * 60), timeZone);
    case "task":
      return toRfc3339(addMinutes(now, 7 * 24 * 60), timeZone);
    case "inventory":
    case "preference":
      return null;
  }
}

/** Convert the flat, all-nullable tool value into the typed value for the category, or null if it cannot. */
export function toTypedValue(category: Category, flat: FlatValue, fallbackLocalDate: string): Record<string, unknown> | null {
  switch (category) {
    case "inventory":
      return flat.availability ? { availability: flat.availability } : null;
    case "plan": {
      if (!flat.meal) return null;
      const date = flat.local_date ?? fallbackLocalDate;
      return parseLocalDate(date) ? { meal: flat.meal, local_date: date } : null;
    }
    case "shopping_interest":
      return flat.intent === "research" || flat.intent === "buy" ? { intent: flat.intent } : null;
    case "task":
      return flat.intent === "buy" || flat.intent === "do" ? { intent: flat.intent, group: flat.group ?? null } : null;
    case "preference":
      return flat.note ? { note: flat.note } : null;
  }
}

export async function getMemoriesTool(args: GetMemoriesArgs, ctx: MemoryToolContext) {
  const records = await ctx.memory.list(ctx.userId);
  const categories = new Set(args.categories);
  const keys = new Set(args.entity_keys.map(canonicalEntityKey));
  const limit = Math.max(1, Math.min(30, args.limit));
  const filtered = records
    .filter((r) => categories.size === 0 || categories.has(r.category))
    .filter((r) => keys.size === 0 || keys.has(r.entityKey))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      version: r.version,
      category: r.category,
      entity: r.entity,
      key: r.entityKey,
      value: r.value,
      summary: r.summary,
      updatedAt: r.updatedAt,
      expiresAt: r.expiresAt,
    }));
  return { memories: filtered };
}

export async function createMemoryTool(args: CreateMemoryArgs, ctx: MemoryToolContext): Promise<MemoryToolOutcome> {
  const localDate = localDateString(ctx.now, ctx.timeZone);
  const accepted: MemoryUpsertEntry[] = [];
  const skipped: MemoryToolOutcome["skipped"] = [];

  for (const entry of args.entries) {
    if (entry.confidence < MEMORY_MIN_CONFIDENCE) {
      skipped.push({ entity: entry.entity, reason: "low_confidence" });
      continue;
    }
    if (!quoteIsFromInput(entry.quote, ctx.inputText)) {
      skipped.push({ entity: entry.entity, reason: "quote_not_in_input" });
      continue;
    }
    const value = toTypedValue(entry.category, entry.value, localDate);
    if (!value) {
      skipped.push({ entity: entry.entity, reason: "missing_value" });
      continue;
    }
    let entityKey: string;
    try {
      const planDate = entry.category === "plan" ? (value.local_date as string) : undefined;
      entityKey = buildEntityKey(entry.category, entry.entity_key || entry.entity, { localDate: planDate });
    } catch {
      skipped.push({ entity: entry.entity, reason: "invalid_key" });
      continue;
    }
    const proposedExpiry = entry.expires_at ? parseRfc3339(entry.expires_at) : null;
    const expiresAt =
      proposedExpiry && proposedExpiry.getTime() > ctx.now.getTime()
        ? toRfc3339(proposedExpiry, ctx.timeZone)
        : defaultExpiry(entry.category, ctx.now, ctx.timeZone);

    accepted.push({
      category: entry.category,
      entity: entry.entity.trim(),
      entityKey,
      value,
      quote: entry.quote,
      confidence: entry.confidence,
      source: ctx.source,
      sourceTurnId: ctx.turnId,
      expiresAt,
    });
  }

  const changes = accepted.length > 0 ? await ctx.memory.upsert(ctx.userId, accepted) : [];
  return { changes, skipped };
}

export async function updateMemoryTool(args: UpdateMemoryArgs, ctx: MemoryToolContext): Promise<MemoryToolOutcome> {
  const localDate = localDateString(ctx.now, ctx.timeZone);
  const accepted: MemoryUpsertEntry[] = [];
  const skipped: MemoryToolOutcome["skipped"] = [];

  for (const entry of args.entries) {
    if (!quoteIsFromInput(entry.quote, ctx.inputText)) {
      skipped.push({ entity: entry.id, reason: "quote_not_in_input" });
      continue;
    }
    let existing;
    try {
      existing = await ctx.memory.get(ctx.userId, entry.id);
    } catch {
      skipped.push({ entity: entry.id, reason: "not_found" });
      continue;
    }
    if (existing.version !== entry.expected_version) {
      skipped.push({ entity: existing.entity, reason: "version_conflict" });
      continue;
    }
    let value: Record<string, unknown> = existing.value;
    if (entry.value) {
      const merged = toTypedValue(existing.category, entry.value, localDate);
      if (!merged) {
        skipped.push({ entity: existing.entity, reason: "missing_value" });
        continue;
      }
      value = merged;
    }
    const status: MemoryStatus = entry.status ?? "active";
    accepted.push({
      category: existing.category,
      entity: existing.entity,
      entityKey: existing.entityKey,
      value,
      quote: entry.quote,
      confidence: 0.95,
      source: ctx.source,
      sourceTurnId: ctx.turnId,
      expiresAt: existing.expiresAt,
      status,
    });
  }

  const changes = accepted.length > 0 ? await ctx.memory.upsert(ctx.userId, accepted) : [];
  return { changes, skipped };
}
