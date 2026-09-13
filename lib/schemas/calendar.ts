import { z } from "zod";
import { isoDateTimeSchema } from "@/lib/schemas/common";
export const calendarReceiptSchema = z.object({
  id: z.string(), status: z.literal("confirmed"), summary: z.string(),
  htmlLink: z.url().refine((value) => { const u = new URL(value); return u.protocol === "https:" && ["www.google.com", "calendar.google.com"].includes(u.hostname); }),
  description: z.string().optional(), location: z.string().optional(),
  start: z.object({ dateTime: isoDateTimeSchema, timeZone: z.string().optional() }),
  end: z.object({ dateTime: isoDateTimeSchema, timeZone: z.string().optional() }),
  extendedProperties: z.object({ private: z.object({ nomiActionId: z.string(), nomiPayloadHash: z.string() }) }),
  attendees: z.array(z.unknown()).optional(),
  reminders: z.object({ useDefault: z.literal(false), overrides: z.array(z.unknown()).optional() }),
});
export type CalendarReceipt = z.infer<typeof calendarReceiptSchema>;
