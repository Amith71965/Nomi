import { z } from "zod";

/**
 * Environment validation. Failures name the missing/invalid VARIABLE ONLY.
 * Optional feature groups (voice, places) only require their keys when enabled.
 * `parseEnv` is pure so tests can exercise it without touching process.env.
 */

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const nonEmpty = z.string().trim().min(1);
const origin = nonEmpty.regex(/^https?:\/\/[^/\s]+$/, "must be an origin without a path");
const url = nonEmpty.url();

const rawSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: origin,

  OPENROUTER_API_KEY: nonEmpty,
  OPENROUTER_BASE_URL: url.default("https://openrouter.ai/api/v1"),
  NOMI_MODEL: nonEmpty.default("openai/gpt-4.1-mini"),
  OPENROUTER_SITE_URL: z.string().trim().optional(),
  OPENROUTER_APP_NAME: z.string().trim().optional(),

  ENABLE_VOICE: bool,
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_TRANSCRIBE_MODEL: nonEmpty.default("gpt-4o-mini-transcribe"),

  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: nonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,

  DEMO_USER_ID: z.uuid(),
  DEMO_TIME_ZONE: nonEmpty.default("America/New_York"),

  GOOGLE_CLIENT_ID: z.string().trim().optional(),
  GOOGLE_CLIENT_SECRET: z.string().trim().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().trim().optional(),
  GOOGLE_CALENDAR_ID: nonEmpty.default("primary"),
  GOOGLE_CALENDAR_LABEL: nonEmpty.default("Nomi Demo Calendar"),
  GOOGLE_OAUTH_REDIRECT_URI: url.default("http://localhost:3001/oauth/callback"),

  PRODUCT_SEARCH_API_KEY: z.string().trim().optional(),
  PRODUCT_SEARCH_LOCATION: z.string().trim().optional(),

  RESEARCH_MODE: z.enum(["live", "cached", "fixture"]).default("live"),
  ENABLE_PLACES: bool,
  GOOGLE_MAPS_API_KEY: z.string().trim().optional(),
});

export type Env = z.infer<typeof rawSchema>;

export class EnvError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Invalid or missing environment variables: ${missing.join(", ")}`);
    this.name = "EnvError";
    this.missing = missing;
  }
}

/** Empty strings are treated as unset so a blank `.env.example` copy fails clearly. */
function blankToUndefined(raw: Record<string, string | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = v === undefined || v.trim() === "" ? undefined : v;
  }
  return out;
}

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = rawSchema.safeParse(blankToUndefined(raw));
  const problems = new Set<string>();
  if (!result.success) {
    for (const issue of result.error.issues) {
      const name = issue.path[0];
      if (typeof name === "string") problems.add(name);
    }
  }
  const env = result.success ? result.data : undefined;

  // Conditional groups: only demand keys when the feature is on.
  const voiceOn = env ? env.ENABLE_VOICE : raw.ENABLE_VOICE === "true";
  if (voiceOn && !(env?.OPENAI_API_KEY ?? raw.OPENAI_API_KEY)) problems.add("OPENAI_API_KEY");

  const placesOn = env ? env.ENABLE_PLACES : raw.ENABLE_PLACES === "true";
  if (placesOn && !(env?.GOOGLE_MAPS_API_KEY ?? raw.GOOGLE_MAPS_API_KEY)) problems.add("GOOGLE_MAPS_API_KEY");

  if (problems.size > 0 || !env) throw new EnvError([...problems].sort());
  return env;
}

/** Calendar is P0 but its credentials arrive in Phase 4; report readiness instead of failing startup. */
export function calendarConfigured(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);
}

export function shoppingConfigured(env: Env): boolean {
  return env.RESEARCH_MODE !== "live" || Boolean(env.PRODUCT_SEARCH_API_KEY);
}

let cached: Env | undefined;

/** Lazily validated process env. Throws EnvError naming variables only. */
export function getEnv(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}

/** Test-only escape hatch. */
export function resetEnvCache(): void {
  cached = undefined;
}
