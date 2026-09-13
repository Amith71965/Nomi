import { z } from "zod";

/** Google Calendar API shapes, limited to the fields Nomi reads. */

export const googleEventSchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  htmlLink: z.string().optional(),
  summary: z.string().optional(),
  start: z.object({ dateTime: z.string().optional(), timeZone: z.string().optional() }).optional(),
  end: z.object({ dateTime: z.string().optional(), timeZone: z.string().optional() }).optional(),
  extendedProperties: z.object({ private: z.record(z.string(), z.string()).optional() }).optional(),
});
export type GoogleEvent = z.infer<typeof googleEventSchema>;

export const googleApiErrorSchema = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});
