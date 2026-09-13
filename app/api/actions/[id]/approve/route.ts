import { approveAction } from "@/lib/actions/execute";
import { requireCalendarServices } from "@/lib/actions/service";
import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { assertSameOrigin, json, readJson, readParam, route } from "@/lib/http";
import { actionVersionRequestSchema } from "@/lib/schemas/actions";
import { uuidSchema } from "@/lib/schemas/common";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * The only path that can create a calendar event, and only after the atomic
 * database claim succeeds. The payload comes from the stored row, never from
 * this request: the body carries a version and nothing else.
 */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, ctx, requestId) => {
  assertSameOrigin(request, getEnv().APP_ORIGIN);
  const auth = await requireUser(request);
  const id = readParam((await ctx.params).id, uuidSchema);
  const { version } = await readJson(request, actionVersionRequestSchema);
  const services = requireCalendarServices();
  const view = await approveAction(services.deps, auth.userId, id, version);
  return json(view, { requestId });
});
