import type { ExecuteDeps } from "@/lib/actions/execute";
import { SupabaseActionStore } from "@/lib/actions/store";
import { SupabaseConnectionStore } from "@/lib/connections/store";
import { getEnv, googleLinkingConfigured } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { GoogleCalendarClient } from "@/lib/integrations/calendar";
import { GOOGLE_CALLBACK_PATH } from "@/lib/connections/linking";
import { GoogleOAuthClient } from "@/lib/integrations/google-oauth";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Production wiring for calendar actions. Everything a user approves runs
 * against THEIR linked calendar, so each service is built per request from the
 * verified user's connection row.
 */

export interface CalendarServices {
  deps: ExecuteDeps;
  /** True when this user has a usable Google link right now. */
  linkedFor(userId: string): Promise<boolean>;
  /** Label and calendar id for the user's proposal card, or null when unlinked. */
  targetFor(userId: string): Promise<{ calendarId: string; calendarLabel: string } | null>;
}

export function calendarServicesFromEnv(): CalendarServices | null {
  const env = getEnv();
  if (!googleLinkingConfigured(env) || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.INTEGRATIONS_ENCRYPTION_KEY) return null;
  const db = createAdminSupabase();
  const connections = new SupabaseConnectionStore(db);
  const deps: ExecuteDeps = {
    actions: new SupabaseActionStore(db),
    connections,
    calendar: new GoogleCalendarClient(),
    google: new GoogleOAuthClient({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${env.APP_ORIGIN}${GOOGLE_CALLBACK_PATH}`,
    }),
    encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY,
  };
  return {
    deps,
    async linkedFor(userId) {
      return (await connections.get(userId, "google_calendar"))?.status === "linked";
    },
    async targetFor(userId) {
      const row = await connections.get(userId, "google_calendar");
      if (!row || row.status !== "linked") return null;
      return { calendarId: row.target_id, calendarLabel: row.account_label };
    },
  };
}

/** Routes call this: linking must be configured AND the caller must have linked their own account. */
export function requireCalendarServices(): CalendarServices {
  const services = calendarServicesFromEnv();
  if (!services) throw new ApiError("provider_unavailable", "Calendar is not set up on this deployment.");
  return services;
}
