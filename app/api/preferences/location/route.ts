import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { assertSameOrigin, json, noContent, readJson, route } from "@/lib/http";
import { resolveLocation } from "@/lib/integrations/places";
import { memoryServiceFromEnv } from "@/lib/memory/service";
import { LOCATION_MAX, SHOPPING_LOCATION_KEY, loadShoppingLocation, saveShoppingLocation } from "@/lib/preferences";

export const runtime = "nodejs";

const bodySchema = z.strictObject({ location: z.string().trim().min(2).max(LOCATION_MAX) });

/** Where the signed-in user shops. Stored as one editable memory, never in the deployment env. */
export const GET = route(async (request, _ctx, requestId) => {
  const auth = await requireUser(request);
  const location = await loadShoppingLocation(memoryServiceFromEnv(), auth.userId);
  return json({ location, verified: null }, { requestId });
});

/**
 * Save it. With a Google Maps key the text is resolved to a canonical
 * "City, State, Country" so product search localizes; without one, or when
 * Google does not recognise it, the user's own words are kept and `verified`
 * says so plainly.
 */
export const PUT = route(async (request, _ctx, requestId) => {
  const env = getEnv();
  assertSameOrigin(request, env.APP_ORIGIN);
  const auth = await requireUser(request);
  const { location } = await readJson(request, bodySchema);

  const resolved = await resolveLocation(location, { apiKey: env.GOOGLE_MAPS_API_KEY });
  const memory = memoryServiceFromEnv();
  await saveShoppingLocation(memory, auth.userId, resolved.value, location);
  return json({ location: resolved.value, verified: resolved.verified }, { requestId });
});

/** Clear it. Product search then runs without a location rather than guessing one. */
export const DELETE = route(async (request, _ctx, requestId) => {
  const env = getEnv();
  assertSameOrigin(request, env.APP_ORIGIN);
  const auth = await requireUser(request);
  const memory = memoryServiceFromEnv();
  const records = await memory.list(auth.userId, "preference");
  const row = records.find((r) => r.entityKey === SHOPPING_LOCATION_KEY);
  if (row) await memory.delete(auth.userId, row.id, row.version);
  return noContent(requestId);
});
