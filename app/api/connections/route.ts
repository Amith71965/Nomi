import type { ConnectionsView } from "@/types/contracts";
import { requireUser } from "@/lib/auth";
import { calendarConfigured, getEnv, shoppingConfigured } from "@/lib/env";
import { json, route } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Honest readiness. In this phase it reports configuration only; live
 * verification (token refresh, provider ping) arrives in Phase 7 and will
 * switch `verification` to "live". Never returns key material.
 */
export const GET = route(async (request, _ctx, requestId) => {
  await requireUser(request);
  const env = getEnv();
  const view: ConnectionsView = {
    checkedAt: new Date().toISOString(),
    verification: "configuration_only",
    model: { ready: env.OPENROUTER_API_KEY.length > 0, label: env.NOMI_MODEL },
    database: { ready: env.NEXT_PUBLIC_SUPABASE_URL.length > 0 && env.SUPABASE_SERVICE_ROLE_KEY.length > 0 },
    calendar: { ready: calendarConfigured(env), label: env.GOOGLE_CALENDAR_LABEL },
    shopping: { ready: shoppingConfigured(env), mode: env.RESEARCH_MODE },
    voice: { enabled: env.ENABLE_VOICE && Boolean(env.OPENAI_API_KEY) },
  };
  return json(view, { requestId });
});
