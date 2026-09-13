import { z } from "zod";
import {
  categorySchema,
  isoDateTimeSchema,
  memorySourceSchema,
  memoryStatusSchema,
  uuidSchema,
  versionSchema,
} from "@/lib/schemas/common";

export const memoryViewSchema = z.object({
  id: uuidSchema,
  category: categorySchema,
  entity: z.string().min(1).max(200),
  summary: z.string().min(1).max(400),
  expiresAt: isoDateTimeSchema.nullable(),
  version: versionSchema,
});
export type MemoryViewInput = z.infer<typeof memoryViewSchema>;

// ── Typed values per category (what goes into memories.value) ───────────────

export const inventoryValueSchema = z.strictObject({
  availability: z.enum(["out", "low", "available"]),
});
export const planValueSchema = z.strictObject({
  meal: z.string().min(1).max(120),
  local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const shoppingInterestValueSchema = z.strictObject({
  intent: z.enum(["research", "buy"]),
});
export const taskValueSchema = z.strictObject({
  intent: z.enum(["buy", "do"]),
  group: z.string().min(1).max(60).nullable(),
});
export const preferenceValueSchema = z.strictObject({
  note: z.string().min(1).max(200),
});

export const memoryValueSchemas = {
  inventory: inventoryValueSchema,
  plan: planValueSchema,
  shopping_interest: shoppingInterestValueSchema,
  task: taskValueSchema,
  preference: preferenceValueSchema,
} as const;

export function memoryValueSchemaFor(category: z.infer<typeof categorySchema>) {
  return memoryValueSchemas[category];
}

/** A full row from the DB, camel-cased for the wire. */
export const memoryRecordSchema = memoryViewSchema.extend({
  entityKey: z.string().min(1).max(160),
  value: z.record(z.string(), z.unknown()),
  status: memoryStatusSchema,
  confidence: z.number().min(0).max(1),
  source: memorySourceSchema,
  sourceQuote: z.string(),
  sourceTurnId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type MemoryRecordInput = z.infer<typeof memoryRecordSchema>;

export const memoryPatchRequestSchema = z
  .strictObject({
    version: versionSchema,
    value: z.record(z.string(), z.unknown()).optional(),
    status: memoryStatusSchema.optional(),
    expiresAt: isoDateTimeSchema.nullable().optional(),
  })
  .refine((v) => v.value !== undefined || v.status !== undefined || v.expiresAt !== undefined, {
    message: "nothing_to_update",
  });

export const memoryDeleteRequestSchema = z.strictObject({
  version: versionSchema,
  confirmed: z.literal(true),
});

export const memoryListQuerySchema = z.object({
  category: categorySchema.optional(),
});
