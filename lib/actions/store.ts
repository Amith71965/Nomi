import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/errors";
import { actionRowSchema, type ActionRow } from "@/lib/schemas/db";

export interface ActionStore {
  get(userId: string, id: string): Promise<ActionRow | null>;
  propose(row: ActionRow): Promise<ActionRow>;
  mutate(userId: string, id: string, version: number, operation: "approve" | "cancel" | "patch", payload?: Record<string, unknown>, hash?: string): Promise<ActionRow | null>;
  finish(row: ActionRow, changes: Partial<ActionRow>): Promise<ActionRow>;
}

export class SupabaseActionStore implements ActionStore {
  constructor(private readonly db: SupabaseClient) {}
  async get(userId: string, id: string): Promise<ActionRow | null> {
    const { data, error } = await this.db.from("actions").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
    if (error) throw unavailable();
    return data ? actionRowSchema.parse(data) : null;
  }
  async propose(row: ActionRow): Promise<ActionRow> {
    const { error } = await this.db.from("actions").upsert(row, { onConflict: "user_id,proposal_key", ignoreDuplicates: true });
    if (error) throw unavailable();
    const result = await this.db.from("actions").select("*").eq("user_id", row.user_id).eq("proposal_key", row.proposal_key).single();
    if (result.error) throw unavailable();
    return actionRowSchema.parse(result.data);
  }
  async mutate(userId: string, id: string, version: number, operation: "approve" | "cancel" | "patch", payload?: Record<string, unknown>, hash?: string): Promise<ActionRow | null> {
    const { data, error } = await this.db.rpc("mutate_calendar_action", { p_user_id: userId, p_id: id, p_version: version, p_operation: operation, p_payload: payload ?? null, p_hash: hash ?? null });
    if (error) throw unavailable();
    return data ? actionRowSchema.parse(data) : null;
  }
  async finish(row: ActionRow, changes: Partial<ActionRow>): Promise<ActionRow> {
    const { data, error } = await this.db.from("actions").update(changes).eq("user_id", row.user_id).eq("id", row.id).eq("version", row.version).in("status", ["executing", "unknown"]).select("*").maybeSingle();
    if (error) throw unavailable();
    if (data) return actionRowSchema.parse(data);
    const current = await this.get(row.user_id, row.id);
    if (!current) throw unavailable();
    return current;
  }
}
function unavailable() { return new ApiError("provider_unavailable", "Could not save or load the calendar action. Check status before trying again."); }
