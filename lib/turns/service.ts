import type { TurnView } from "@/types/contracts";
import { assistantResponseSchema } from "@/lib/schemas/assistant";
import type { TurnRow } from "@/lib/schemas/db";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { SupabaseTurnStore, type TurnStore } from "@/lib/turns/store";

export const TURN_HISTORY_LIMIT = 50;

/** A stored response that no longer validates is shown as absent, never rendered blindly. */
export function toTurnView(row: TurnRow): TurnView {
  const parsed = row.response === null ? null : assistantResponseSchema.safeParse(row.response);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    inputText: row.input_text,
    inputKind: row.input_kind,
    status: row.status,
    response: parsed && parsed.success ? parsed.data : null,
    errorCode: parsed && !parsed.success ? "invalid_stored_response" : row.error_code,
    createdAt: row.created_at,
  };
}

export class TurnService {
  constructor(private readonly store: TurnStore) {}

  async list(userId: string, conversationId: string): Promise<TurnView[]> {
    const rows = await this.store.list(userId, conversationId, TURN_HISTORY_LIMIT);
    return rows.map(toTurnView);
  }
}

export function turnServiceFromEnv(): TurnService {
  return new TurnService(new SupabaseTurnStore(createAdminSupabase()));
}
