import { z } from "zod";
import { assistantResponseSchema } from "@/lib/schemas/assistant";
import { inputKindSchema, isoDateTimeSchema, turnStatusSchema, uuidSchema } from "@/lib/schemas/common";

export const turnViewSchema = z.object({
  id: uuidSchema,
  conversationId: uuidSchema,
  inputText: z.string(),
  inputKind: inputKindSchema,
  status: turnStatusSchema,
  response: assistantResponseSchema.nullable(),
  errorCode: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});

export const turnsListSchema = z.object({ turns: z.array(turnViewSchema) });
