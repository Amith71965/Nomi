import { requireUser } from "@/lib/auth";
import { CONNECTIONS_PAGE, OAUTH_STATE_COOKIE, linkingServiceFromEnv } from "@/lib/connections/linking";
import { isApiError } from "@/lib/errors";
import { readCookie, redirectTo, route } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Google sends the browser back here. The session user must be the one who
 * started the link (signed state + cookie), the code is exchanged server-side,
 * and the refresh token is sealed before it is stored. Every failure lands on
 * the connections page with a plain reason; no token ever appears in a URL.
 */
export const GET = route(async (request, _ctx, requestId) => {
  let userId: string;
  try {
    userId = (await requireUser(request)).userId;
  } catch (e) {
    if (isApiError(e) && e.code === "unauthenticated") {
      return redirectTo(`/login?next=${encodeURIComponent(CONNECTIONS_PAGE)}`, { requestId });
    }
    throw e;
  }

  const linking = linkingServiceFromEnv();
  if (!linking) return redirectTo(`${CONNECTIONS_PAGE}?link_error=unavailable`, { requestId });

  const params = new URL(request.url).searchParams;
  const result = await linking.completeGoogle({
    userId,
    code: params.get("code"),
    state: params.get("state"),
    cookieState: readCookie(request, OAUTH_STATE_COOKIE),
    providerError: params.get("error"),
  });
  const clear = linking.clearStateCookie();
  if (result.outcome === "linked") {
    return redirectTo(`${CONNECTIONS_PAGE}?linked=google_calendar`, { requestId, cookies: [clear] });
  }
  return redirectTo(`${CONNECTIONS_PAGE}?link_error=${result.reason}`, { requestId, cookies: [clear] });
});
