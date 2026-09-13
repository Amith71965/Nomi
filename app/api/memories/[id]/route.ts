import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { assertSameOrigin, json, noContent, readJson, readParam, route } from "@/lib/http";
import { memoryServiceFromEnv } from "@/lib/memory/service";
import { uuidSchema } from "@/lib/schemas/common";
import { memoryDeleteRequestSchema, memoryPatchRequestSchema } from "@/lib/schemas/memory";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Explicit UI Save. `409 version_conflict` if the row moved on; `409 turn_in_progress` while the assistant runs. */
export const PATCH = route<Ctx>(async (request, ctx, requestId) => {
  assertSameOrigin(request, getEnv().APP_ORIGIN);
  const auth = await requireUser(request);
  const id = readParam((await ctx.params).id, uuidSchema);
  const body = await readJson(request, memoryPatchRequestSchema);
  const memory = await memoryServiceFromEnv().patch(auth.userId, id, body);
  return json({ memory }, { requestId });
});

/** Named confirmation happens in the UI; the body must carry `confirmed: true` and the current version. */
export const DELETE = route<Ctx>(async (request, ctx, requestId) => {
  assertSameOrigin(request, getEnv().APP_ORIGIN);
  const auth = await requireUser(request);
  const id = readParam((await ctx.params).id, uuidSchema);
  const body = await readJson(request, memoryDeleteRequestSchema);
  await memoryServiceFromEnv().delete(auth.userId, id, body.version);
  return noContent(requestId);
});
