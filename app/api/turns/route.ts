import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { json, readQuery, route } from "@/lib/http";
import { uuidSchema } from "@/lib/schemas/common";
import { turnServiceFromEnv } from "@/lib/turns/service";

export const runtime = "nodejs";

const querySchema = z.object({ conversationId: uuidSchema });

/** The signed-in user's turns for one conversation, oldest first. Never another account's rows. */
export const GET = route(async (request, _ctx, requestId) => {
  const auth = await requireUser(request);
  const { conversationId } = readQuery(request, querySchema);
  const turns = await turnServiceFromEnv().list(auth.userId, conversationId);
  return json({ turns }, { requestId });
});
