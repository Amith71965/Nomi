import { requireUser } from "@/lib/auth";
import { CONNECTIONS_PAGE, linkingServiceFromEnv } from "@/lib/connections/linking";
import { redirectTo, route } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Begins linking the signed-in user's Google Calendar: sets the signed state
 * cookie and sends the browser to Google's consent screen. Nothing is stored
 * until the callback succeeds.
 */
export const GET = route(async (request, _ctx, requestId) => {
  const auth = await requireUser(request);
  const linking = linkingServiceFromEnv();
  if (!linking) return redirectTo(`${CONNECTIONS_PAGE}?link_error=unavailable`, { requestId });
  const { url, cookie } = linking.startGoogle(auth.userId);
  return redirectTo(url, { requestId, cookies: [cookie] });
});
