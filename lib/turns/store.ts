import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { InputKind } from "@/types/contracts";
import { ApiError } from "@/lib/errors";
import { turnRowSchema, type TurnRow } from "@/lib/schemas/db";

export interface BeginTurnInput {
  conversationId: string;
  clientRequestId: string;
  inputText: string;
  inputKind: InputKind;
}

export type BeginTurnResult =
  | { kind: "created"; row: TurnRow }
  | { kind: "existing"; row: TurnRow }
  | { kind: "busy" }
  | { kind: "rate_limited" };

export type ReopenTurnResult = { kind: "reopened"; row: TurnRow } | { kind: "busy" } | { kind: "not_found" };

export interface TurnStore {
  list(userId: string, conversationId: string, limit: number): Promise<TurnRow[]>;
  get(userId: string, id: string): Promise<TurnRow | null>;
  begin(userId: string, input: BeginTurnInput): Promise<BeginTurnResult>;
  reopen(userId: string, id: string): Promise<ReopenTurnResult>;
  complete(userId: string, id: string, response: unknown, evidence: unknown[]): Promise<TurnRow>;
  fail(userId: string, id: string, errorCode: string): Promise<void>;
  /** Completed turns still in model context, newest first. */
  recentContext(userId: string, conversationId: string, limit: number): Promise<TurnRow[]>;
}

const beginResultSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("created"), turn: turnRowSchema }),
  z.object({ outcome: z.literal("existing"), turn: turnRowSchema }),
  z.object({ outcome: z.literal("busy") }),
  z.object({ outcome: z.literal("rate_limited") }),
]);

const reopenResultSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("reopened"), turn: turnRowSchema }),
  z.object({ outcome: z.literal("busy") }),
  z.object({ outcome: z.literal("not_found") }),
]);

function dbError(operation: string, message: string): ApiError {
  return new ApiError("provider_unavailable", "The database request failed.", { details: { operation, message } });
}

export class SupabaseTurnStore implements TurnStore {
  constructor(private readonly db: SupabaseClient) {}

  async list(userId: string, conversationId: string, limit: number): Promise<TurnRow[]> {
    const { data, error } = await this.db
      .from("turns")
      .select("*")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw dbError("turns.list", error.message);
    return turnRowSchema.array().parse(data ?? []);
  }

  async get(userId: string, id: string): Promise<TurnRow | null> {
    const { data, error } = await this.db.from("turns").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
    if (error) throw dbError("turns.get", error.message);
    return data ? turnRowSchema.parse(data) : null;
  }

  async begin(userId: string, input: BeginTurnInput): Promise<BeginTurnResult> {
    const { data, error } = await this.db.rpc("begin_turn", {
      p_user_id: userId,
      p_conversation_id: input.conversationId,
      p_client_request_id: input.clientRequestId,
      p_input_text: input.inputText,
      p_input_kind: input.inputKind,
    });
    if (error) throw dbError("begin_turn", error.message);
    const parsed = beginResultSchema.parse(data);
    switch (parsed.outcome) {
      case "created":
        return { kind: "created", row: parsed.turn };
      case "existing":
        return { kind: "existing", row: parsed.turn };
      case "busy":
        return { kind: "busy" };
      case "rate_limited":
        return { kind: "rate_limited" };
    }
  }

  async reopen(userId: string, id: string): Promise<ReopenTurnResult> {
    const { data, error } = await this.db.rpc("reopen_turn", { p_user_id: userId, p_turn_id: id });
    if (error) throw dbError("reopen_turn", error.message);
    const parsed = reopenResultSchema.parse(data);
    return parsed.outcome === "reopened" ? { kind: "reopened", row: parsed.turn } : { kind: parsed.outcome };
  }

  async complete(userId: string, id: string, response: unknown, evidence: unknown[]): Promise<TurnRow> {
    const { data, error } = await this.db
      .from("turns")
      .update({ status: "completed", response, evidence, error_code: null })
      .eq("user_id", userId)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw dbError("turns.complete", error.message);
    return turnRowSchema.parse(data);
  }

  async fail(userId: string, id: string, errorCode: string): Promise<void> {
    const { error } = await this.db.from("turns").update({ status: "failed", error_code: errorCode }).eq("user_id", userId).eq("id", id);
    if (error) throw dbError("turns.fail", error.message);
  }

  async recentContext(userId: string, conversationId: string, limit: number): Promise<TurnRow[]> {
    const { data, error } = await this.db
      .from("turns")
      .select("*")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .eq("include_in_context", true)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw dbError("turns.recentContext", error.message);
    return turnRowSchema.array().parse(data ?? []);
  }
}

/** Tests and fixtures only. Mirrors the RPC semantics, including the 60 s abandonment rule. */
export class InMemoryTurnStore implements TurnStore {
  private rows: TurnRow[] = [];
  private seq = 0;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  seed(row: TurnRow): void {
    this.rows.push(row);
  }

  reset(): void {
    this.rows = [];
    this.seq = 0;
  }

  all(): TurnRow[] {
    return [...this.rows];
  }

  private newId(): string {
    this.seq += 1;
    return `10000000-0000-4000-8000-${this.seq.toString().padStart(12, "0")}`;
  }

  async list(userId: string, conversationId: string, limit: number): Promise<TurnRow[]> {
    return this.rows
      .filter((r) => r.user_id === userId && r.conversation_id === conversationId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit);
  }

  async get(userId: string, id: string): Promise<TurnRow | null> {
    return this.rows.find((r) => r.user_id === userId && r.id === id) ?? null;
  }

  async begin(userId: string, input: BeginTurnInput): Promise<BeginTurnResult> {
    const now = this.clock();
    const existing = this.rows.find((r) => r.user_id === userId && r.client_request_id === input.clientRequestId);
    if (existing) return { kind: "existing", row: existing };

    for (const r of this.rows) {
      if (r.user_id === userId && r.status === "processing" && now.getTime() - Date.parse(r.created_at) > 60_000) {
        r.status = "failed";
        r.error_code = "abandoned";
      }
    }
    if (this.rows.some((r) => r.user_id === userId && r.status === "processing")) return { kind: "busy" };
    const recent = this.rows.filter((r) => r.user_id === userId && now.getTime() - Date.parse(r.created_at) < 60_000).length;
    if (recent >= 10) return { kind: "rate_limited" };

    const row: TurnRow = {
      id: this.newId(),
      user_id: userId,
      conversation_id: input.conversationId,
      client_request_id: input.clientRequestId,
      input_text: input.inputText,
      input_kind: input.inputKind,
      include_in_context: true,
      status: "processing",
      response: null,
      evidence: [],
      error_code: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    this.rows.push(row);
    return { kind: "created", row };
  }

  async reopen(userId: string, id: string): Promise<ReopenTurnResult> {
    if (this.rows.some((r) => r.user_id === userId && r.status === "processing")) return { kind: "busy" };
    const row = this.rows.find((r) => r.user_id === userId && r.id === id && r.status === "failed");
    if (!row) return { kind: "not_found" };
    row.status = "processing";
    row.error_code = null;
    row.response = null;
    row.created_at = this.clock().toISOString();
    return { kind: "reopened", row };
  }

  async complete(userId: string, id: string, response: unknown, evidence: unknown[]): Promise<TurnRow> {
    const row = this.rows.find((r) => r.user_id === userId && r.id === id);
    if (!row) throw new ApiError("not_found", "Turn not found.");
    row.status = "completed";
    row.response = response;
    row.evidence = evidence;
    row.error_code = null;
    row.updated_at = this.clock().toISOString();
    return row;
  }

  async fail(userId: string, id: string, errorCode: string): Promise<void> {
    const row = this.rows.find((r) => r.user_id === userId && r.id === id);
    if (!row) return;
    row.status = "failed";
    row.error_code = errorCode;
    row.updated_at = this.clock().toISOString();
  }

  async recentContext(userId: string, conversationId: string, limit: number): Promise<TurnRow[]> {
    return this.rows
      .filter((r) => r.user_id === userId && r.conversation_id === conversationId && r.include_in_context && r.status === "completed")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  /** Mirror of invalidate_context for tests. */
  invalidate(userId: string): void {
    for (const r of this.rows) if (r.user_id === userId) r.include_in_context = false;
  }
}
