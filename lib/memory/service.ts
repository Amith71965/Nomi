import type { Category, MemoryRecord, MemoryStatus, MemoryView } from "@/types/contracts";
import { ApiError } from "@/lib/errors";
import { isValidEntityKey } from "@/lib/memory/normalize";
import {
  SupabaseMemoryStore,
  type MemoryPatchInput,
  type MemoryStore,
  type MemoryUpsertEntry,
} from "@/lib/memory/store";
import { memoryValueSchemaFor } from "@/lib/schemas/memory";
import type { MemoryRow } from "@/lib/schemas/db";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const MEMORY_BATCH_MAX = 8;
export const MEMORY_MIN_CONFIDENCE = 0.8;

/** Human summary shown on chips and in the memory list. Derived, never model-written. */
export function summarize(category: Category, entity: string, value: Record<string, unknown>): string {
  switch (category) {
    case "inventory": {
      const a = value.availability;
      if (a === "out") return `Out of ${lower(entity)}`;
      if (a === "low") return `Running low on ${lower(entity)}`;
      if (a === "available") return `${cap(entity)} available`;
      return cap(entity);
    }
    case "plan": {
      const meal = typeof value.meal === "string" ? value.meal : entity;
      const date = typeof value.local_date === "string" ? value.local_date : null;
      return date ? `Cooking ${lower(meal)} on ${date}` : `Cooking ${lower(meal)}`;
    }
    case "shopping_interest":
      return value.intent === "buy" ? `Planning to buy ${lower(entity)}` : `Looking for ${lower(entity)}`;
    case "task":
      return value.intent === "buy" ? `Need to buy ${lower(entity)}` : `To do: ${lower(entity)}`;
    case "preference":
      return typeof value.note === "string" ? value.note : cap(entity);
  }
}

export function toMemoryView(row: MemoryRow): MemoryView {
  return {
    id: row.id,
    category: row.category,
    entity: row.entity,
    summary: summarize(row.category, row.entity, row.value),
    expiresAt: row.expires_at,
    version: row.version,
  };
}

export function toMemoryRecord(row: MemoryRow): MemoryRecord {
  return {
    ...toMemoryView(row),
    entityKey: row.entity_key,
    value: row.value,
    status: row.status,
    confidence: row.confidence,
    source: row.source,
    sourceQuote: row.source_quote,
    sourceTurnId: row.source_turn_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface MemoryChange {
  operation: "created" | "updated";
  memory: MemoryView;
}

export class MemoryService {
  constructor(
    private readonly store: MemoryStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * Commit explicit facts. Entries are validated against the per-category value
   * schema and the key format; anything below the confidence floor is dropped
   * (the orchestrator asks a clarifying question instead of guessing).
   */
  async upsert(userId: string, entries: MemoryUpsertEntry[]): Promise<MemoryChange[]> {
    if (entries.length === 0) return [];
    if (entries.length > MEMORY_BATCH_MAX) {
      throw new ApiError("malformed_input", `At most ${MEMORY_BATCH_MAX} memories per batch.`);
    }
    const accepted: MemoryUpsertEntry[] = [];
    for (const entry of entries) {
      if (entry.confidence < MEMORY_MIN_CONFIDENCE) continue;
      if (!isValidEntityKey(entry.entityKey)) {
        throw new ApiError("malformed_input", "Invalid memory key.", { details: { entityKey: entry.entityKey } });
      }
      if (entry.quote.trim().length === 0) {
        throw new ApiError("malformed_input", "A memory needs the user's supporting quote.");
      }
      const parsed = memoryValueSchemaFor(entry.category).safeParse(entry.value);
      if (!parsed.success) {
        throw new ApiError("malformed_input", "Memory value does not match its category.", {
          details: { category: entry.category },
        });
      }
      accepted.push({ ...entry, value: parsed.data });
    }
    const results = await this.store.upsert(userId, accepted);
    return results.map((r) => ({ operation: r.operation, memory: toMemoryView(r.row) }));
  }

  async list(userId: string, category?: Category): Promise<MemoryRecord[]> {
    const rows = await this.store.listActive(userId, { category, now: this.clock() });
    return rows.map(toMemoryRecord);
  }

  async get(userId: string, id: string): Promise<MemoryRecord> {
    const row = await this.store.get(userId, id);
    if (!row) throw notFound();
    return toMemoryRecord(row);
  }

  /** Explicit UI Save. Version must match; value must fit the row's category. */
  async patch(userId: string, id: string, patch: MemoryPatchInput): Promise<MemoryRecord> {
    const existing = await this.store.get(userId, id);
    if (!existing) throw notFound();
    let value = patch.value;
    if (value !== undefined) {
      const parsed = memoryValueSchemaFor(existing.category).safeParse(value);
      if (!parsed.success) {
        throw new ApiError("malformed_input", "Memory value does not match its category.");
      }
      value = parsed.data;
    }
    const result = await this.store.patch(userId, id, { ...patch, value });
    switch (result.outcome) {
      case "updated":
        return toMemoryRecord(result.row);
      case "version_conflict":
        throw new ApiError("version_conflict", "This memory changed since you loaded it. Reload and try again.");
      case "turn_in_progress":
        throw new ApiError("turn_in_progress", "Wait for the current request to finish before editing memory.");
      case "not_found":
        throw notFound();
    }
  }

  /** Confirmed deletion. Callers must have validated `confirmed: true` already. */
  async delete(userId: string, id: string, version: number): Promise<void> {
    const outcome = await this.store.delete(userId, id, version);
    switch (outcome) {
      case "deleted":
        return;
      case "version_conflict":
        throw new ApiError("version_conflict", "This memory changed since you loaded it. Reload and try again.");
      case "turn_in_progress":
        throw new ApiError("turn_in_progress", "Wait for the current request to finish before deleting memory.");
      case "not_found":
        throw notFound();
    }
  }
}

export type { MemoryPatchInput, MemoryUpsertEntry, MemoryStatus };

function notFound(): ApiError {
  return new ApiError("not_found", "Memory not found.");
}

function lower(s: string): string {
  return s.trim().toLowerCase();
}

function cap(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Production wiring. Route handlers call this; tests substitute an in-memory store. */
export function memoryServiceFromEnv(): MemoryService {
  return new MemoryService(new SupabaseMemoryStore(createAdminSupabase()));
}
