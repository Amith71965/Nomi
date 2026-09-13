import { z } from "zod";

export const transcriptionProviderSchema = z.enum(["deepgram", "openai"]);

export const transcriptionViewSchema = z.object({
  text: z.string().max(4000),
  confidence: z.number().min(0).max(1).nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  provider: transcriptionProviderSchema,
  model: z.string().min(1),
});

/** The subset of Deepgram's pre-recorded response we rely on. Everything else is ignored. */
export const deepgramResponseSchema = z.object({
  metadata: z.object({ request_id: z.string().optional(), duration: z.number().nonnegative().optional() }).passthrough().optional(),
  results: z.object({
    channels: z
      .array(
        z.object({
          alternatives: z.array(z.object({ transcript: z.string(), confidence: z.number().optional() }).passthrough()).min(1),
        }),
      )
      .min(1),
  }),
});
