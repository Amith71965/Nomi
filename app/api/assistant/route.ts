import { modelClientFromEnv } from "@/lib/ai/client";
import { capabilitiesFromEnv, processAssistantRequest } from "@/lib/ai/service";
import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { assertSameOrigin, json, readJson, route } from "@/lib/http";
import { memoryServiceFromEnv } from "@/lib/memory/service";
import { assistantRequestSchema } from "@/lib/schemas/assistant";
import { turnStoreFromEnv } from "@/lib/turns/service";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * One assistant turn. Exactly one input form: text/note/voice transcript, or
 * a saved suggestion referenced by its source turn. Idempotent on
 * clientRequestId; one active turn per user.
 */
export const POST = route(async (request, _ctx, requestId) => {
  const env = getEnv();
  assertSameOrigin(request, env.APP_ORIGIN);
  const auth = await requireUser(request);
  const body = await readJson(request, assistantRequestSchema);

  const response = await processAssistantRequest(
    {
      model: modelClientFromEnv(),
      memory: memoryServiceFromEnv(),
      turns: turnStoreFromEnv(),
      capabilities: capabilitiesFromEnv(env),
    },
    { userId: auth.userId, body, now: new Date() },
  );
  return json(response, { requestId });
});
