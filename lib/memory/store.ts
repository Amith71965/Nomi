import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, MemorySource, MemoryStatus } from "@/types/contracts";
import { ApiError } from "@/lib/errors";
import {
  deleteMemoryResultSchema,
  memoryRowSchema,
  patchMemoryResultSchema,
  upsertMemoriesResultSchema,
  type MemoryRow,
} from "@/lib/schemas/db";

/**
 * Storage seam for memories. The Supabase implementation is thin and delegates
 * transactional behaviour to the RPCs in 002_memory_rpc.sql. The in-memory
 * implementation mirrors those semantics for tests.
 */

export interface MemoryUpsertEntry {
  category: Category;
  entity: string;
  entityKey: string;
  value: Record<string, unknown>;
  quote: string;
  confidence: number;
  source: MemorySource;
  sourceTurnId: string | null;
  expiresAt: string | null;
  /** Defaults to "active". An assistant-driven correction may complete or cancel a fact. */
  status?: MemoryStatus;
}

export interface MemoryPatchInput {
  version: number;
  value?: Record<string, unknown>;
  status?: MemoryStatus;
  expiresAt?: string | null;
}

export type UpsertResult = { operation: "created" | "updated"; row: MemoryRow };
export type PatchResult =
  | { outcome: "updated"; row: MemoryRow }
  | { outcome: "version_conflict" }
  | { outcome: "not_found" }
  | { outcome: "turn_in_progress" };
export type DeleteResult = "deleted" | "version_conflict" | "not_found" | "turn_in_progress";

export interface MemoryStore {
  upsert(userId: string, entries: MemoryUpsertEntry[]): Promise<UpsertResult[]>;
  listActive(userId: string, options: { category?: Category; now: Date }): Promise<MemoryRow[]>;
  get(userId: string, id: string): Promise<MemoryRow | null>;
  patch(userId: string, id: string, patch: MemoryPatchInput): Promise<PatchResult>;
  delete(userId: string, id: string, version: number): Promise<DeleteResult>;
}

// ── Supabase implementation ─────────────────────────────────────────────────

export class SupabaseMemoryStore implements MemoryStore {
  constructor(private readonly db: SupabaseClient) {}

  async upsert(userId: string, entries: MemoryUpsertEntry[]): Promise<UpsertResult[]> {
    const { data, error } = await this.db.rpc("upsert_memories", {
      p_user_id: userId,
      p_entries: entries.map((e) => ({
        category: e.category,
        entity: e.entity,
        entity_key: e.entityKey,
        value: e.value,
        quote: e.quote,
        confidence: e.confidence,
        source: e.source,
        source_turn_id: e.sourceTurnId,
        expires_at: e.expiresAt,
        status: e.status ?? "active",
      })),
    });
    if (error) throw dbError("upsert_memories", error.message);
    const parsed = upsertMemoriesResultSchema.parse(data);
    return parsed.results.map((r) => ({ operation: r.operation, row: r.memory }));
  }

  async listActive(userId: string, options: { category?: Category; now: Date }): Promise<MemoryRow[]> {
    let query = this.db
      .from("memories")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gt.${options.now.toISOString()}`)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (options.category) query = query.eq("category", options.category);
    const { data, error } = await query;
    if (error) throw dbError("memories.list", error.message);
    return memoryRowSchema.array().parse(data ?? []);
  }

  async get(userId: string, id: string): Promise<MemoryRow | null> {
    const { data, error } = await this.db.from("memories").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
    if (error) throw dbError("memories.get", error.message);
    return data ? memoryRowSchema.parse(data) : null;
  }

  async patch(userId: string, id: string, patch: MemoryPatchInput): Promise<PatchResult> {
    const p_patch: Record<string, unknown> = {};
    if (patch.value !== undefined) p_patch.value = patch.value;
    if (patch.status !== undefined) p_patch.status = patch.status;
    if (patch.expiresAt !== undefined) p_patch.expiresAt = patch.expiresAt;
    const { data, error } = await this.db.rpc("patch_memory", {
      p_user_id: userId,
      p_memory_id: id,
      p_version: patch.version,
      p_patch,
    });
    if (error) throw dbError("patch_memory", error.message);
    const parsed = patchMemoryResultSchema.parse(data);
    return parsed.outcome === "updated" ? { outcome: "updated", row: parsed.memory } : { outcome: parsed.outcome };
  }

  async delete(userId: string, id: string, version: number): Promise<DeleteResult> {
    const { data, error } = await this.db.rpc("delete_memory", {
      p_user_id: userId,
      p_memory_id: id,
      p_version: version,
    });
    if (error) throw dbError("delete_memory", error.message);
    return deleteMemoryResultSchema.parse(data).outcome;
  }
}

function dbError(operation: string, message: string): ApiError {
  // Provider messages can contain table names but never user content; keep them out of the response anyway.
  return new ApiError("provider_unavailable", "The database request failed.", { details: { operation, message } });
}

// ── In-memory implementation (tests and fixtures only) ──────────────────────

export class InMemoryMemoryStore implements MemoryStore {
  private rows = new Map<string, MemoryRow>();
  private seq = 0;
  /** Users with a turn currently `processing`; edits are refused for them. */
  readonly activeTurnUsers = new Set<string>();
  /** Turn IDs → created_at, so "newer source wins" can be mirrored. */
  readonly turnCreatedAt = new Map<string, string>();
  /** Users whose context was invalidated by an edit/delete, and how many times. */
  readonly invalidations = new Map<string, number>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  seed(row: MemoryRow): void {
    this.rows.set(row.id, row);
  }

  /** Synchronous full reset for test isolation. */
  reset(): void {
    this.rows.clear();
    this.activeTurnUsers.clear();
    this.turnCreatedAt.clear();
    this.invalidations.clear();
  }

  all(): MemoryRow[] {
    return [...this.rows.values()];
  }

  private newId(): string {
    this.seq += 1;
    return `00000000-0000-4000-8000-${this.seq.toString().padStart(12, "0")}`;
  }

  async upsert(userId: string, entries: MemoryUpsertEntry[]): Promise<UpsertResult[]> {
    const now = this.clock().toISOString();
    const results: UpsertResult[] = [];
    for (const e of entries) {
      const existing = this.all().find(
        (r) => r.user_id === userId && r.category === e.category && r.entity_key === e.entityKey,
      );
      if (existing) {
        // Same turn reprocessed is a no-op. Two nulls are NOT the same turn:
        // a manual edit has no turn, and SQL's NULL comparison agrees.
        if (existing.source_turn_id !== null && existing.source_turn_id === e.sourceTurnId) continue;
        const sourceCreated = e.sourceTurnId ? (this.turnCreatedAt.get(e.sourceTurnId) ?? now) : null;
        if (sourceCreated !== null && sourceCreated < existing.updated_at) continue; // older turn cannot overwrite
        const updated: MemoryRow = {
          ...existing,
          entity: e.entity,
          value: e.value,
          status: e.status ?? "active",
          confidence: e.confidence,
          source: e.source,
          source_quote: e.quote,
          source_turn_id: e.sourceTurnId,
          expires_at: e.expiresAt,
          version: existing.version + 1,
          updated_at: now,
        };
        this.rows.set(updated.id, updated);
        results.push({ operation: "updated", row: updated });
      } else {
        const row: MemoryRow = {
          id: this.newId(),
          user_id: userId,
          category: e.category,
          entity_key: e.entityKey,
          entity: e.entity,
          value: e.value,
          status: e.status ?? "active",
          confidence: e.confidence,
          source: e.source,
          source_quote: e.quote,
          source_turn_id: e.sourceTurnId,
          version: 1,
          expires_at: e.expiresAt,
          created_at: now,
          updated_at: now,
        };
        this.rows.set(row.id, row);
        results.push({ operation: "created", row });
      }
    }
    return results;
  }

  async listActive(userId: string, options: { category?: Category; now: Date }): Promise<MemoryRow[]> {
    const nowMs = options.now.getTime();
    return this.all()
      .filter(
        (r) =>
          r.user_id === userId &&
          r.status === "active" &&
          (r.expires_at === null || Date.parse(r.expires_at) > nowMs) &&
          (options.category === undefined || r.category === options.category),
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 100);
  }

  async get(userId: string, id: string): Promise<MemoryRow | null> {
    const row = this.rows.get(id);
    return row && row.user_id === userId ? row : null;
  }

  async patch(userId: string, id: string, patch: MemoryPatchInput): Promise<PatchResult> {
    if (this.activeTurnUsers.has(userId)) return { outcome: "turn_in_progress" };
    const row = await this.get(userId, id);
    if (!row) return { outcome: "not_found" };
    if (row.version !== patch.version) return { outcome: "version_conflict" };
    const updated: MemoryRow = {
      ...row,
      value: patch.value ?? row.value,
      status: patch.status ?? row.status,
      expires_at: patch.expiresAt !== undefined ? patch.expiresAt : row.expires_at,
      source: "manual_edit",
      source_turn_id: null,
      version: row.version + 1,
      updated_at: this.clock().toISOString(),
    };
    this.rows.set(id, updated);
    this.invalidate(userId);
    return { outcome: "updated", row: updated };
  }

  async delete(userId: string, id: string, version: number): Promise<DeleteResult> {
    if (this.activeTurnUsers.has(userId)) return "turn_in_progress";
    const row = await this.get(userId, id);
    if (!row) return "not_found";
    if (row.version !== version) return "version_conflict";
    this.rows.delete(id);
    this.invalidate(userId);
    return "deleted";
  }

  private invalidate(userId: string): void {
    this.invalidations.set(userId, (this.invalidations.get(userId) ?? 0) + 1);
  }
}
