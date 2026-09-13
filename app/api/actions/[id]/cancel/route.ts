import { cancelAction } from "@/lib/actions/execute";
import { requireCalendarServices } from "@/lib/actions/service";
import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { assertSameOrigin, json, readJson, readParam, route } from "@/lib/http";
import { actionVersionRequestSchema } from "@/lib/schemas/actions";
import { uuidSchema } from "@/lib/schemas/common";

export const runtime = "nodejs";

/** Cancel a proposal. Nothing is ever created; an already-executing action cannot be cancelled. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, ctx, requestId) => {
  assertSameOrigin(request, getEnv().APP_ORIGIN);
  const auth = await requireUser(request);
  const id = readParam((await ctx.params).id, uuidSchema);
  const { version } = await readJson(request, actionVersionRequestSchema);
  const services = requireCalendarServices();
  const view = await cancelAction(services.deps, auth.userId, id, version);
  return json(view, { requestId });
});
