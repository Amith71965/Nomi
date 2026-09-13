import { viewWithExpiry } from "@/lib/actions/proposals";
import { requireCalendarServices } from "@/lib/actions/service";
import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { assertSameOrigin, json, readJson, readParam, route } from "@/lib/http";
import { actionPatchRequestSchema, calendarDraftSchema } from "@/lib/schemas/actions";
import { uuidSchema } from "@/lib/schemas/common";
import { payloadHash } from "@/lib/actions/policy";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** The caller's own proposal, with expiry applied at read time. */
export const GET = route<Ctx>(async (request, ctx, requestId) => {
  const auth = await requireUser(request);
  const id = readParam((await ctx.params).id, uuidSchema);
  const services = requireCalendarServices();
  const row = await services.deps.actions.get(auth.userId, id);
  if (!row) throw new ApiError("not_found", "That proposal was not found.");
  return json(viewWithExpiry(row, new Date()), { requestId });
});

/**
 * Change the proposal before approving. The new payload is validated and
 * stored, and the version is bumped so a card the user has not seen cannot
 * approve it.
 */
export const PATCH = route<Ctx>(async (request, ctx, requestId) => {
  assertSameOrigin(request, getEnv().APP_ORIGIN);
  const auth = await requireUser(request);
  const id = readParam((await ctx.params).id, uuidSchema);
  const body = await readJson(request, actionPatchRequestSchema);
  const services = requireCalendarServices();

  const row = await services.deps.actions.get(auth.userId, id);
  if (!row) throw new ApiError("not_found", "That proposal was not found.");
  const current = calendarDraftSchema.parse(row.payload);
  const next = calendarDraftSchema.parse({
    ...current,
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.startAt !== undefined ? { startAt: body.startAt } : {}),
    ...(body.endAt !== undefined ? { endAt: body.endAt } : {}),
    ...(body.timeZone !== undefined ? { timeZone: body.timeZone } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.location !== undefined ? { location: body.location } : {}),
  });
  if (Date.parse(next.endAt) <= Date.parse(next.startAt)) {
    throw new ApiError("malformed_input", "The event must end after it starts.");
  }
  if (Date.parse(next.startAt) <= Date.now()) {
    throw new ApiError("malformed_input", "That time is in the past. Choose a future time.");
  }

  const result = await services.deps.actions.patch(auth.userId, id, body.version, next, payloadHash(next));
  switch (result.outcome) {
    case "updated":
      return json(viewWithExpiry(result.row, new Date()), { requestId });
    case "not_found":
      throw new ApiError("not_found", "That proposal was not found.");
    case "expired":
      throw new ApiError("expired_proposal", "That proposal expired. Ask Nomi to propose it again.");
    case "not_proposed":
      throw new ApiError("stale_proposal", `This proposal is ${result.row.status} and can no longer be changed.`);
    case "stale":
      throw new ApiError("stale_proposal", "This proposal changed since you saw it. Reload the card.");
  }
});
