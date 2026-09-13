import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ActionStatus } from "@/types/contracts";
import { ApiError } from "@/lib/errors";
import { actionRowSchema, type ActionRow } from "@/lib/schemas/db";

/**
 * Storage seam for actions. Every state change goes through an RPC in
 * 005_actions_rpc.sql so the transition is atomic: the database, not this
 * process, decides who wins a race.
 */

export interface CreateActionInput {
  sourceTurnId: string;
  proposalKey: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  targetCalendarId: string;
  providerEventId: string;
  expiresAt: string;
}

export type ClaimResult =
  | { outcome: "claimed"; row: ActionRow }
  | { outcome: "stale"; row: ActionRow }
  | { outcome: "expired"; row: ActionRow }
  | { outcome: "already_processing"; row: ActionRow }
  | { outcome: "not_proposed"; row: ActionRow }
  | { outcome: "not_found" };

export type CancelResult =
  | { outcome: "cancelled"; row: ActionRow }
  | { outcome: "stale"; row: ActionRow }
  | { outcome: "already_processing"; row: ActionRow }
  | { outcome: "not_proposed"; row: ActionRow }
  | { outcome: "not_found" };

export type PatchResult =
  | { outcome: "updated"; row: ActionRow }
  | { outcome: "stale"; row: ActionRow }
  | { outcome: "expired"; row: ActionRow }
  | { outcome: "not_proposed"; row: ActionRow }
  | { outcome: "not_found" };

export interface ActionStore {
  /** Idempotent on (user, proposal_key): re-proposing the same intent returns the existing row. */
  create(userId: string, input: CreateActionInput): Promise<ActionRow>;
  get(userId: string, id: string): Promise<ActionRow | null>;
  claim(userId: string, id: string, version: number): Promise<ClaimResult>;
  cancel(userId: string, id: string, version: number): Promise<CancelResult>;
  patch(userId: string, id: string, version: number, payload: Record<string, unknown>, payloadHash: string): Promise<PatchResult>;
  settle(userId: string, id: string, status: Extract<ActionStatus, "succeeded" | "failed" | "unknown">, receipt: unknown, errorCode: string | null): Promise<ActionRow | null>;
}

const withRow = <T extends string>(outcomes: readonly T[]) =>
  z.union([
    z.object({ outcome: z.enum(outcomes as unknown as [T, ...T[]]), action: actionRowSchema }),
    z.object({ outcome: z.literal("not_found") }),
    z.object({ outcome: z.literal("not_claimed") }),
    z.object({ outcome: z.literal("invalid_status") }),
  ]);

function dbError(operation: string, message: string): ApiError {
  return new ApiError("provider_unavailable", "The database request failed.", { details: { operation, message } });
}

export class SupabaseActionStore implements ActionStore {
  constructor(private readonly db: SupabaseClient) {}

  async create(userId: string, input: CreateActionInput): Promise<ActionRow> {
    const existing = await this.byProposalKey(userId, input.proposalKey);
    if (existing) return existing;
    const { data, error } = await this.db
      .from("actions")
      .insert({
        user_id: userId,
        source_turn_id: input.sourceTurnId,
        kind: "calendar.create",
        proposal_key: input.proposalKey,
        payload: input.payload,
        payload_hash: input.payloadHash,
        target_calendar_id: input.targetCalendarId,
        provider_event_id: input.providerEventId,
        expires_at: input.expiresAt,
      })
      .select("*")
      .single();
    if (error) {
      // Unique violation: another request created the same proposal first.
      const raced = await this.byProposalKey(userId, input.proposalKey);
      if (raced) return raced;
      throw dbError("actions.create", error.message);
    }
    return actionRowSchema.parse(data);
  }

  private async byProposalKey(userId: string, proposalKey: string): Promise<ActionRow | null> {
    const { data, error } = await this.db.from("actions").select("*").eq("user_id", userId).eq("proposal_key", proposalKey).maybeSingle();
    if (error) throw dbError("actions.byProposalKey", error.message);
    return data ? actionRowSchema.parse(data) : null;
  }

  async get(userId: string, id: string): Promise<ActionRow | null> {
    const { data, error } = await this.db.from("actions").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
    if (error) throw dbError("actions.get", error.message);
    return data ? actionRowSchema.parse(data) : null;
  }

  async claim(userId: string, id: string, version: number): Promise<ClaimResult> {
    const { data, error } = await this.db.rpc("claim_action", { p_user_id: userId, p_action_id: id, p_version: version });
    if (error) throw dbError("claim_action", error.message);
    const parsed = withRow(["claimed", "stale", "expired", "already_processing", "not_proposed"] as const).parse(data);
    return ("action" in parsed ? { outcome: parsed.outcome, row: parsed.action } : { outcome: "not_found" }) as ClaimResult;
  }

  async cancel(userId: string, id: string, version: number): Promise<CancelResult> {
    const { data, error } = await this.db.rpc("cancel_action", { p_user_id: userId, p_action_id: id, p_version: version });
    if (error) throw dbError("cancel_action", error.message);
    const parsed = withRow(["cancelled", "stale", "already_processing", "not_proposed"] as const).parse(data);
    return ("action" in parsed ? { outcome: parsed.outcome, row: parsed.action } : { outcome: "not_found" }) as CancelResult;
  }

  async patch(userId: string, id: string, version: number, payload: Record<string, unknown>, payloadHash: string): Promise<PatchResult> {
    const { data, error } = await this.db.rpc("patch_action", { p_user_id: userId, p_action_id: id, p_version: version, p_payload: payload, p_payload_hash: payloadHash });
    if (error) throw dbError("patch_action", error.message);
    const parsed = withRow(["updated", "stale", "expired", "not_proposed"] as const).parse(data);
    return ("action" in parsed ? { outcome: parsed.outcome, row: parsed.action } : { outcome: "not_found" }) as PatchResult;
  }

  async settle(userId: string, id: string, status: Extract<ActionStatus, "succeeded" | "failed" | "unknown">, receipt: unknown, errorCode: string | null): Promise<ActionRow | null> {
    const { data, error } = await this.db.rpc("settle_action", { p_user_id: userId, p_action_id: id, p_status: status, p_receipt: receipt ?? null, p_error_code: errorCode });
    if (error) throw dbError("settle_action", error.message);
    const parsed = withRow(["settled"] as const).parse(data);
    return "action" in parsed ? parsed.action : null;
  }
}

// ── In-memory implementation (tests only) ───────────────────────────────────

export class InMemoryActionStore implements ActionStore {
  private rows = new Map<string, ActionRow>();
  private seq = 0;
  /** Set by tests to run something between the claim read and its write. */
  onBeforeClaimWrite: (() => Promise<void>) | null = null;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  reset(): void {
    this.rows.clear();
    this.onBeforeClaimWrite = null;
  }

  all(): ActionRow[] {
    return [...this.rows.values()];
  }

  seed(row: ActionRow): void {
    this.rows.set(row.id, row);
  }

  newId(): string {
    this.seq += 1;
    return `00000000-0000-4000-8000-${this.seq.toString().padStart(12, "0")}`;
  }

  async create(userId: string, input: CreateActionInput): Promise<ActionRow> {
    const existing = this.all().find((r) => r.user_id === userId && r.proposal_key === input.proposalKey);
    if (existing) return existing;
    const now = this.clock().toISOString();
    const row: ActionRow = {
      id: this.newId(),
      user_id: userId,
      source_turn_id: input.sourceTurnId,
      kind: "calendar.create",
      proposal_key: input.proposalKey,
      payload: input.payload,
      payload_hash: input.payloadHash,
      target_calendar_id: input.targetCalendarId,
      version: 1,
      approval_level: 2,
      status: "proposed",
      provider_event_id: input.providerEventId,
      provider_receipt: null,
      approved_at: null,
      approved_by: null,
      attempted_at: null,
      executed_at: null,
      expires_at: input.expiresAt,
      error_code: null,
      created_at: now,
      updated_at: now,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async get(userId: string, id: string): Promise<ActionRow | null> {
    const row = this.rows.get(id);
    return row && row.user_id === userId ? row : null;
  }

  private expireIfDue(row: ActionRow): ActionRow {
    if (row.status === "proposed" && Date.parse(row.expires_at) <= this.clock().getTime()) {
      const expired: ActionRow = { ...row, status: "expired", updated_at: this.clock().toISOString() };
      this.rows.set(row.id, expired);
      return expired;
    }
    return row;
  }

  /**
   * Atomic like the RPC: the hook (a test's interleaved cancel) runs BEFORE the
   * critical section, and the read-check-write below never yields, so two
   * concurrent callers cannot both claim.
   */
  async claim(userId: string, id: string, version: number): Promise<ClaimResult> {
    if (this.onBeforeClaimWrite) {
      const hook = this.onBeforeClaimWrite;
      this.onBeforeClaimWrite = null;
      await hook();
    }
    const current = this.rows.get(id);
    if (!current || current.user_id !== userId) return { outcome: "not_found" };
    const row = this.expireIfDue(current);
    if (row.status === "expired") return { outcome: "expired", row };
    if (row.status === "executing") return { outcome: "already_processing", row };
    if (row.status !== "proposed") return { outcome: "not_proposed", row };
    if (row.version !== version) return { outcome: "stale", row };
    const now = this.clock().toISOString();
    const claimed: ActionRow = { ...row, status: "executing", approved_at: now, approved_by: userId, attempted_at: now, updated_at: now };
    this.rows.set(id, claimed);
    return { outcome: "claimed", row: claimed };
  }

  async cancel(userId: string, id: string, version: number): Promise<CancelResult> {
    const row = await this.get(userId, id);
    if (!row) return { outcome: "not_found" };
    if (row.status === "executing") return { outcome: "already_processing", row };
    if (row.status !== "proposed") return { outcome: "not_proposed", row };
    if (row.version !== version) return { outcome: "stale", row };
    const cancelled: ActionRow = { ...row, status: "cancelled", updated_at: this.clock().toISOString() };
    this.rows.set(id, cancelled);
    return { outcome: "cancelled", row: cancelled };
  }

  async patch(userId: string, id: string, version: number, payload: Record<string, unknown>, payloadHash: string): Promise<PatchResult> {
    let row = await this.get(userId, id);
    if (!row) return { outcome: "not_found" };
    row = this.expireIfDue(row);
    if (row.status === "expired") return { outcome: "expired", row };
    if (row.status !== "proposed") return { outcome: "not_proposed", row };
    if (row.version !== version) return { outcome: "stale", row };
    const updated: ActionRow = { ...row, payload, payload_hash: payloadHash, version: row.version + 1, updated_at: this.clock().toISOString() };
    this.rows.set(id, updated);
    return { outcome: "updated", row: updated };
  }

  async settle(userId: string, id: string, status: Extract<ActionStatus, "succeeded" | "failed" | "unknown">, receipt: unknown, errorCode: string | null): Promise<ActionRow | null> {
    const row = await this.get(userId, id);
    if (!row || (row.status !== "executing" && row.status !== "unknown")) return null;
    const now = this.clock().toISOString();
    const settled: ActionRow = {
      ...row,
      status,
      provider_receipt: receipt ?? null,
      executed_at: status === "succeeded" ? now : row.executed_at,
      error_code: errorCode,
      updated_at: now,
    };
    this.rows.set(id, settled);
    return settled;
  }
}
