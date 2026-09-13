import { z } from "zod";
import { isoDateTimeSchema } from "@/lib/schemas/common";

export const linkableProviderSchema = z.enum(["google_calendar"]);
export const integrationKindSchema = z.enum(["link", "included", "external", "planned", "never"]);
export const integrationStatusSchema = z.enum([
  "linked",
  "not_linked",
  "error",
  "unavailable",
  "included",
  "not_ready",
  "external",
  "planned",
  "never",
]);

export const integrationViewSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  kind: integrationKindSchema,
  status: integrationStatusSchema,
  tagline: z.string(),
  enables: z.array(z.string()),
  never: z.array(z.string()),
  account: z.object({ email: z.string().nullable(), label: z.string() }).nullable(),
  linkedAt: z.string().nullable(),
  detail: z.string().nullable(),
  connectPath: z.string().startsWith("/api/").nullable(),
  unlinkPath: z.string().startsWith("/api/").nullable(),
  externalUrl: z.url({ protocol: /^https$/ }).nullable(),
});

export const connectionsViewSchema = z.object({
  checkedAt: isoDateTimeSchema,
  verification: z.enum(["configuration_only", "live"]),
  integrations: z.array(integrationViewSchema),
  server: z.object({
    model: z.object({ ready: z.boolean(), label: z.string() }),
    database: z.object({ ready: z.boolean() }),
    voice: z.object({ enabled: z.boolean(), provider: z.enum(["deepgram", "openai"]).nullable() }),
    linking: z.object({ ready: z.boolean() }),
  }),
});
