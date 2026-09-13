import { z } from "zod";
import { isValidTimeZone } from "@/lib/time";

export const uuidSchema = z.uuid();
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const httpsUrlSchema = z.url({ protocol: /^https$/ });
export const httpUrlSchema = z.url({ protocol: /^https?$/ });

export const categorySchema = z.enum(["inventory", "shopping_interest", "task", "plan", "preference"]);
export const dataModeSchema = z.enum(["live", "cached", "fixture"]);
export const inputKindSchema = z.enum(["text", "note", "voice", "suggestion"]);
export const memorySourceSchema = z.enum(["text", "note", "voice", "manual_edit"]);
export const memoryStatusSchema = z.enum(["active", "completed", "cancelled"]);
export const actionKindSchema = z.literal("calendar.create");
export const actionStatusSchema = z.enum([
  "proposed",
  "executing",
  "succeeded",
  "failed",
  "unknown",
  "cancelled",
  "expired",
]);
export const turnStatusSchema = z.enum(["processing", "completed", "failed"]);

export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, { message: "invalid_time_zone" });

export const INPUT_TEXT_MAX = 4000;
export const inputTextSchema = z.string().trim().min(1).max(INPUT_TEXT_MAX);

/** Positive integer version for optimistic concurrency. */
export const versionSchema = z.int().positive();
