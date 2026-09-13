import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/errors";
import { turnRowSchema, type TurnRow } from "@/lib/schemas/db";

export interface TurnStore {
  list(userId: string, conversationId: string, limit: number): Promise<TurnRow[]>;
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
    if (error) {
      throw new ApiError("provider_unavailable", "The database request failed.", { details: { operation: "turns.list" } });
    }
    return turnRowSchema.array().parse(data ?? []);
  }
}

/** Tests and fixtures only. */
export class InMemoryTurnStore implements TurnStore {
  private rows: TurnRow[] = [];

  seed(row: TurnRow): void {
    this.rows.push(row);
  }

  reset(): void {
    this.rows = [];
  }

  async list(userId: string, conversationId: string, limit: number): Promise<TurnRow[]> {
    return this.rows
      .filter((r) => r.user_id === userId && r.conversation_id === conversationId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit);
  }
}
