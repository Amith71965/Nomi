import { requireUser } from "@/lib/auth";
import { connectionsServiceFromEnv } from "@/lib/connections/service";
import { json, route } from "@/lib/http";

export const runtime = "nodejs";

/**
 * The integrations catalogue merged with the signed-in user's own links and
 * the deployment's server-side readiness. Statuses come from real rows and
 * real configuration; token material is never selected, let alone returned.
 */
export const GET = route(async (request, _ctx, requestId) => {
  const auth = await requireUser(request);
  const view = await connectionsServiceFromEnv().view(auth.userId);
  return json(view, { requestId });
});
