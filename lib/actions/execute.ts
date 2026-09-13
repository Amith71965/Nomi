import type { ActionView } from "@/types/contracts";
import { toActionView, viewWithExpiry } from "@/lib/actions/proposals";
import type { ActionStore } from "@/lib/actions/store";
import type { ConnectionStore } from "@/lib/connections/store";
import { openBox } from "@/lib/crypto";
import { ApiError } from "@/lib/errors";
import { GoogleCalendarClient, receiptFrom } from "@/lib/integrations/calendar";
import { GoogleOAuthClient } from "@/lib/integrations/google-oauth";
import { calendarDraftSchema } from "@/lib/schemas/actions";

/**
 * Approval execution. Order matters and is not negotiable:
 *   1. claim in the database (atomic; only one caller can win)
 *   2. refresh the user's own access token from their linked connection
 *   3. insert the event with the deterministic ID
 *   4. verify the receipt and settle the row
 * A failure after step 1 settles the row as failed or unknown; an unknown row
 * is resolved by reading the event back by its ID, never by inserting again.
 */

export interface ExecuteDeps {
  actions: ActionStore;
  connections: ConnectionStore;
  calendar: GoogleCalendarClient;
  google: GoogleOAuthClient;
  encryptionKey: string;
  now?: () => Date;
}

export class NotLinkedError extends ApiError {
  constructor() {
    super("not_linked", "Link your Google Calendar before approving this. Open Linked apps to connect it.", { retryable: false });
    this.name = "NotLinkedError";
  }
}

/** The user's own access token, refreshed from their sealed refresh token. */
async function accessTokenFor(deps: ExecuteDeps, userId: string): Promise<string> {
  const secret = await deps.connections.secret(userId, "google_calendar");
  if (!secret) throw new NotLinkedError();
  let refreshToken: string;
  try {
    refreshToken = openBox(secret.ciphertext, deps.encryptionKey);
  } catch {
    await deps.connections.markError(userId, "google_calendar", "unreadable_token");
    throw new ApiError("provider_error", "Your Google link could not be read. Connect it again from Linked apps.", { retryable: false });
  }
  try {
    const tokens = await deps.google.refresh(refreshToken);
    return tokens.accessToken;
  } catch (error) {
    const code = error instanceof Error && "providerCode" in error ? String((error as { providerCode: unknown }).providerCode) : "refresh_failed";
    if (code === "invalid_grant") {
      await deps.connections.markError(userId, "google_calendar", "invalid_grant");
      throw new ApiError("provider_error", "Your Google link expired. Connect it again from Linked apps.", { retryable: false });
    }
    throw error;
  }
}

export async function approveAction(deps: ExecuteDeps, userId: string, actionId: string, version: number): Promise<ActionView> {
  const now = (deps.now ?? (() => new Date()))();
  const claim = await deps.actions.claim(userId, actionId, version);

  switch (claim.outcome) {
    case "not_found":
      throw new ApiError("not_found", "That proposal was not found.");
    case "expired":
      throw new ApiError("expired_proposal", "That proposal expired before it was approved. Nothing was created.");
    case "already_processing":
      throw new ApiError("already_processing", "This proposal is already being processed.");
    case "not_proposed":
      throw new ApiError("stale_proposal", `This proposal is ${claim.row.status}. Nothing was created.`);
    case "stale":
      throw new ApiError("stale_proposal", "This proposal changed since you saw it. Reload the card and approve again.");
    case "claimed":
      break;
  }

  const row = claim.row;
  const draft = calendarDraftSchema.parse(row.payload);

  let accessToken: string;
  try {
    accessToken = await accessTokenFor(deps, userId);
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "token_failed";
    await deps.actions.settle(userId, actionId, "failed", null, code);
    throw error;
  }

  const result = await deps.calendar.createEvent({
    accessToken,
    calendarId: row.target_calendar_id,
    eventId: row.provider_event_id,
    actionId: row.id,
    draft,
  });

  if (result.outcome === "created" || result.outcome === "already_exists") {
    const settled = await deps.actions.settle(userId, actionId, "succeeded", receiptFrom(result.event), null);
    return settled ? toActionView(settled) : viewWithExpiry(row, now);
  }
  if (result.outcome === "failed") {
    const settled = await deps.actions.settle(userId, actionId, "failed", null, result.code);
    return settled ? toActionView(settled) : viewWithExpiry(row, now);
  }
  // Ambiguous: the event may exist. Record `unknown` and reconcile by ID.
  await deps.actions.settle(userId, actionId, "unknown", null, result.code);
  return reconcileAction(deps, userId, actionId);
}

/**
 * Resolve an `unknown` action by reading the event back by its deterministic
 * ID. Never inserts. Used after a timeout and by "Check status".
 */
export async function reconcileAction(deps: ExecuteDeps, userId: string, actionId: string): Promise<ActionView> {
  const now = (deps.now ?? (() => new Date()))();
  const row = await deps.actions.get(userId, actionId);
  if (!row) throw new ApiError("not_found", "That proposal was not found.");
  if (row.status !== "unknown") return viewWithExpiry(row, now);

  let accessToken: string;
  try {
    accessToken = await accessTokenFor(deps, userId);
  } catch {
    return toActionView(row); // still unknown; the card offers Check status again
  }

  let event;
  try {
    event = await deps.calendar.getEvent({ accessToken, calendarId: row.target_calendar_id, eventId: row.provider_event_id });
  } catch {
    return toActionView(row);
  }
  const settled = event
    ? await deps.actions.settle(userId, actionId, "succeeded", receiptFrom(event), null)
    : await deps.actions.settle(userId, actionId, "failed", null, row.error_code ?? "not_created");
  return settled ? toActionView(settled) : toActionView(row);
}

export async function cancelAction(deps: Pick<ExecuteDeps, "actions" | "now">, userId: string, actionId: string, version: number): Promise<ActionView> {
  const now = (deps.now ?? (() => new Date()))();
  const result = await deps.actions.cancel(userId, actionId, version);
  switch (result.outcome) {
    case "cancelled":
      return toActionView(result.row);
    case "not_found":
      throw new ApiError("not_found", "That proposal was not found.");
    case "already_processing":
      throw new ApiError("already_processing", "This proposal is already being processed and cannot be cancelled.");
    case "not_proposed":
      return viewWithExpiry(result.row, now); // already cancelled or expired: report the real state
    case "stale":
      throw new ApiError("stale_proposal", "This proposal changed since you saw it. Reload the card.");
  }
}
