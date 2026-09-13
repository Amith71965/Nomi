import { z } from "zod";
import { dataModeSchema, isoDateTimeSchema } from "@/lib/schemas/common";

export const connectionsViewSchema = z.object({
  checkedAt: isoDateTimeSchema,
  verification: z.enum(["configuration_only", "live"]),
  model: z.object({ ready: z.boolean(), label: z.string() }),
  database: z.object({ ready: z.boolean() }),
  calendar: z.object({ ready: z.boolean(), label: z.string() }),
  shopping: z.object({ ready: z.boolean(), mode: dataModeSchema }),
  voice: z.object({ enabled: z.boolean(), provider: z.enum(["deepgram", "openai"]).nullable() }),
});
