import { requireUser } from "@/lib/auth";
import { linkingServiceFromEnv } from "@/lib/connections/linking";
import { getEnv } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { assertSameOrigin, json, route } from "@/lib/http";

export const runtime = "nodejs";

/** Unlink the caller's Google Calendar: revoke at Google, drop the sealed token. */
export const DELETE = route(async (request, _ctx, requestId) => {
  const auth = await requireUser(request);
  assertSameOrigin(request, getEnv().APP_ORIGIN);
  const linking = linkingServiceFromEnv();
  if (!linking) throw new ApiError("provider_unavailable", "Linking is not set up on this deployment.");
  const result = await linking.unlinkGoogle(auth.userId);
  if (!result) throw new ApiError("not_found", "Google Calendar is not linked.");
  return json(result, { requestId });
});
