import { z } from "zod";
import {
  actionKindSchema,
  actionStatusSchema,
  isoDateTimeSchema,
  timeZoneSchema,
  uuidSchema,
  versionSchema,
} from "@/lib/schemas/common";

export const calendarDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  timeZone: timeZoneSchema,
  calendarLabel: z.string().min(1).max(120),
  location: z.string().trim().min(1).max(300).nullable(),
  description: z.string().max(2000),
});
export type CalendarDraftInput = z.infer<typeof calendarDraftSchema>;

export const actionViewSchema = z.object({
  id: uuidSchema,
  version: versionSchema,
  kind: actionKindSchema,
  level: z.literal(2),
  status: actionStatusSchema,
  expiresAt: isoDateTimeSchema,
  preview: calendarDraftSchema,
  eventId: z.string().nullable(),
  eventUrl: z.url().nullable(),
  executedAt: isoDateTimeSchema.nullable(),
  errorCode: z.string().nullable(),
});

export const actionPatchRequestSchema = z
  .strictObject({
    version: versionSchema,
    title: z.string().trim().min(1).max(200).optional(),
    startAt: isoDateTimeSchema.optional(),
    endAt: isoDateTimeSchema.optional(),
    timeZone: timeZoneSchema.optional(),
    description: z.string().max(2000).optional(),
    location: z.string().trim().min(1).max(300).nullable().optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.startAt !== undefined ||
      v.endAt !== undefined ||
      v.timeZone !== undefined ||
      v.description !== undefined ||
      v.location !== undefined,
    { message: "nothing_to_update" },
  );

export const actionVersionRequestSchema = z.strictObject({
  version: versionSchema,
});
