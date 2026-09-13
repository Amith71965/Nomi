import type { MemoryRecord } from "@/types/contracts";
import type { MemoryService } from "@/lib/memory/service";
import { buildEntityKey } from "@/lib/memory/normalize";

/**
 * Preferences are ordinary memories, so the user can see, edit, and delete
 * them in the same place as everything else Nomi remembers. The shopping
 * location lives here rather than in the deployment's environment: where
 * somebody shops is their choice, not the operator's.
 */

export const SHOPPING_LOCATION_ENTITY = "Shopping location";
export const SHOPPING_LOCATION_KEY = buildEntityKey("preference", SHOPPING_LOCATION_ENTITY);
export const LOCATION_MAX = 120;

export function readShoppingLocation(records: readonly MemoryRecord[]): string | null {
  const row = records.find((r) => r.category === "preference" && r.entityKey === SHOPPING_LOCATION_KEY && r.status === "active");
  const note = row?.value.note;
  return typeof note === "string" && note.trim().length > 0 ? note.trim() : null;
}

export async function loadShoppingLocation(memory: MemoryService, userId: string): Promise<string | null> {
  return readShoppingLocation(await memory.list(userId, "preference"));
}

/** Save the user's own words (or the canonical form Google returned for them). */
export async function saveShoppingLocation(memory: MemoryService, userId: string, location: string, quote: string): Promise<MemoryRecord | null> {
  await memory.upsert(userId, [
    {
      category: "preference",
      entity: SHOPPING_LOCATION_ENTITY,
      entityKey: SHOPPING_LOCATION_KEY,
      value: { note: location.slice(0, LOCATION_MAX) },
      quote: quote.slice(0, 400),
      confidence: 1,
      source: "manual_edit",
      sourceTurnId: null,
      expiresAt: null,
    },
  ]);
  const records = await memory.list(userId, "preference");
  return records.find((r) => r.entityKey === SHOPPING_LOCATION_KEY) ?? null;
}
