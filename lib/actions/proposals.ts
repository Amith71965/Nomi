import type { ActionView, CalendarDraft } from "@/types/contracts";
import { PROPOSAL_TTL_MS, payloadHash, proposalKey, providerEventIdFor } from "@/lib/actions/policy";
import type { ActionStore, CreateActionInput } from "@/lib/actions/store";
import { calendarDraftSchema } from "@/lib/schemas/actions";
import type { ActionRow } from "@/lib/schemas/db";
import { addMinutes, defaultGrocerySlot, isInPast, parseRfc3339, toRfc3339 } from "@/lib/time";

/**
 * Proposal construction. The payload the user approves is exactly the payload
 * stored here; the executor reads it back from the database rather than from
 * the request. Times come from the server clock and an explicit IANA zone.
 */

export const DEFAULT_EVENT_MINUTES = 30;

export type SlotResolution =
  | { ok: true; startAt: string; endAt: string }
  | { ok: false; reason: "past" | "ambiguous" | "unparseable" | "no_default_slot" };

/** Resolve the model's proposed time. A past or unusable time is refused, never rolled forward. */
export function resolveSlot(input: { startAt: string | null; endAt: string | null; timeZone: string; now: Date }): SlotResolution {
  if (input.startAt === null) {
    const slot = defaultGrocerySlot(input.now, input.timeZone, DEFAULT_EVENT_MINUTES);
    return slot ? { ok: true, startAt: slot.startAt, endAt: slot.endAt } : { ok: false, reason: "no_default_slot" };
  }
  const start = parseRfc3339(input.startAt);
  if (!start) return { ok: false, reason: "unparseable" };
  if (isInPast(start, input.now)) return { ok: false, reason: "past" };
  const proposedEnd = input.endAt ? parseRfc3339(input.endAt) : null;
  const end = proposedEnd && proposedEnd.getTime() > start.getTime() ? proposedEnd : addMinutes(start, DEFAULT_EVENT_MINUTES);
  return { ok: true, startAt: toRfc3339(start, input.timeZone), endAt: toRfc3339(end, input.timeZone) };
}

export interface BuildProposalInput {
  sourceTurnId: string;
  intentKind: string;
  draft: CalendarDraft;
  targetCalendarId: string;
  now: Date;
  /** Pre-allocated action id so the provider event id is fixed before the row exists. */
  actionId: string;
}

export function buildProposal(input: BuildProposalInput): CreateActionInput {
  const payload = calendarDraftSchema.parse(input.draft);
  return {
    sourceTurnId: input.sourceTurnId,
    proposalKey: proposalKey(input.sourceTurnId, input.intentKind),
    payload,
    payloadHash: payloadHash(payload),
    targetCalendarId: input.targetCalendarId,
    providerEventId: providerEventIdFor(input.actionId),
    expiresAt: new Date(input.now.getTime() + PROPOSAL_TTL_MS).toISOString(),
  };
}

/** Row → wire view. The link is only present once the provider actually returned one. */
export function toActionView(row: ActionRow): ActionView {
  const receipt = row.provider_receipt as { htmlLink?: unknown } | null;
  const eventUrl = receipt && typeof receipt.htmlLink === "string" ? receipt.htmlLink : null;
  return {
    id: row.id,
    version: row.version,
    kind: "calendar.create",
    level: 2,
    status: row.status,
    expiresAt: row.expires_at,
    preview: calendarDraftSchema.parse(row.payload),
    eventId: row.status === "succeeded" ? row.provider_event_id : null,
    eventUrl: row.status === "succeeded" ? eventUrl : null,
    executedAt: row.executed_at,
    errorCode: row.error_code,
  };
}

/** A row whose expiry has passed reads as expired even before the next write touches it. */
export function viewWithExpiry(row: ActionRow, now: Date): ActionView {
  const view = toActionView(row);
  if (view.status === "proposed" && Date.parse(view.expiresAt) <= now.getTime()) return { ...view, status: "expired" };
  return view;
}

export async function createProposal(store: ActionStore, userId: string, input: BuildProposalInput): Promise<ActionRow> {
  return store.create(userId, buildProposal(input));
}
