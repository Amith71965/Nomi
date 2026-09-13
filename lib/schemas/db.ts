import { z } from "zod";
import {
  actionKindSchema,
  actionStatusSchema,
  categorySchema,
  inputKindSchema,
  memorySourceSchema,
  memoryStatusSchema,
  turnStatusSchema,
} from "@/lib/schemas/common";

/**
 * Row shapes as they come back from Postgres through supabase-js.
 * numeric arrives as a string, timestamptz as an RFC3339 string with offset.
 * Every row read from the database is validated here before use.
 */

const timestamp = z.string().min(1);

export const memoryRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  category: categorySchema,
  entity_key: z.string().min(1).max(160),
  entity: z.string().min(1),
  value: z.record(z.string(), z.unknown()),
  status: memoryStatusSchema,
  confidence: z.coerce.number().min(0).max(1),
  source: memorySourceSchema,
  source_quote: z.string(),
  source_turn_id: z.uuid().nullable(),
  version: z.int().positive(),
  expires_at: timestamp.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export type MemoryRow = z.infer<typeof memoryRowSchema>;

export const turnRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  conversation_id: z.uuid(),
  client_request_id: z.uuid(),
  input_text: z.string(),
  input_kind: inputKindSchema,
  include_in_context: z.boolean(),
  status: turnStatusSchema,
  response: z.unknown().nullable(),
  evidence: z.unknown(),
  error_code: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export type TurnRow = z.infer<typeof turnRowSchema>;

export const actionRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  source_turn_id: z.uuid(),
  kind: actionKindSchema,
  proposal_key: z.string(),
  payload: z.record(z.string(), z.unknown()),
  payload_hash: z.string(),
  target_calendar_id: z.string(),
  version: z.int().positive(),
  approval_level: z.literal(2),
  status: actionStatusSchema,
  provider_event_id: z.string(),
  provider_receipt: z.unknown().nullable(),
  approved_at: timestamp.nullable(),
  approved_by: z.uuid().nullable(),
  attempted_at: timestamp.nullable(),
  executed_at: timestamp.nullable(),
  expires_at: timestamp,
  error_code: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export type ActionRow = z.infer<typeof actionRowSchema>;

// ── RPC results ─────────────────────────────────────────────────────────────

export const upsertMemoriesResultSchema = z.object({
  results: z.array(z.object({ operation: z.enum(["created", "updated"]), memory: memoryRowSchema })),
});

export const patchMemoryResultSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("updated"), memory: memoryRowSchema }),
  z.object({ outcome: z.literal("version_conflict") }),
  z.object({ outcome: z.literal("not_found") }),
  z.object({ outcome: z.literal("turn_in_progress") }),
]);

export const deleteMemoryResultSchema = z.object({
  outcome: z.enum(["deleted", "version_conflict", "not_found", "turn_in_progress"]),
});

// ── Linked apps (public columns only; the sealed token is never selected here) ──

export const connectionRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  provider: z.enum(["google_calendar"]),
  status: z.enum(["linked", "revoked", "error"]),
  account_email: z.string().nullable(),
  account_label: z.string().min(1),
  external_account_id: z.string().nullable(),
  target_id: z.string().min(1),
  scopes: z.array(z.string()),
  linked_at: timestamp,
  revoked_at: timestamp.nullable(),
  last_verified_at: timestamp.nullable(),
  error_code: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export type ConnectionRow = z.infer<typeof connectionRowSchema>;
