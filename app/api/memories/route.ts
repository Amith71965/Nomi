import { requireUser } from "@/lib/auth";
import { json, readQuery, route } from "@/lib/http";
import { memoryServiceFromEnv } from "@/lib/memory/service";
import { memoryListQuerySchema } from "@/lib/schemas/memory";

export const runtime = "nodejs";

/** Active, unexpired memories for the signed-in user. Optional `?category=`. */
export const GET = route(async (request, _ctx, requestId) => {
  const auth = await requireUser(request);
  const query = readQuery(request, memoryListQuerySchema);
  const memories = await memoryServiceFromEnv().list(auth.userId, query.category);
  return json({ memories }, { requestId });
});
