import { openBox } from "@/lib/crypto";
import { ApiError } from "@/lib/errors";
import type { ConnectionStore } from "@/lib/connections/store";
import { GoogleOAuthClient, GoogleOAuthError, type FetchLike } from "@/lib/integrations/google-oauth";
import { calendarDraftSchema } from "@/lib/schemas/actions";
import { calendarReceiptSchema, type CalendarReceipt } from "@/lib/schemas/calendar";
import type { ActionRow } from "@/lib/schemas/db";

export interface CalendarProvider {
  insert(row: ActionRow): Promise<CalendarReceipt>;
  get(row: ActionRow): Promise<CalendarReceipt | null>;
}
export class CalendarWriteError extends Error {
  constructor(readonly uncertain: boolean) { super("Google could not confirm the calendar write."); }
}
export function verifyReceipt(raw: unknown, row: ActionRow): CalendarReceipt {
  const parsed = calendarReceiptSchema.safeParse(raw);
  if (!parsed.success) throw new CalendarWriteError(true);
  const event = parsed.data;
  const draft = calendarDraftSchema.parse(row.payload);
  if (event.id !== row.provider_event_id || event.extendedProperties.private.nomiActionId !== row.id ||
    event.extendedProperties.private.nomiPayloadHash !== row.payload_hash || event.summary !== draft.title ||
    Date.parse(event.start.dateTime) !== Date.parse(draft.startAt) || Date.parse(event.end.dateTime) !== Date.parse(draft.endAt) ||
    event.start.timeZone !== draft.timeZone || event.end.timeZone !== draft.timeZone ||
    (event.description ?? "") !== draft.description || (event.location ?? null) !== draft.location ||
    (event.attendees?.length ?? 0) > 0 || (event.reminders.overrides?.length ?? 0) > 0) throw new CalendarWriteError(true);
  return event;
}

export class GoogleCalendarProvider implements CalendarProvider {
  constructor(private readonly connections: ConnectionStore, private readonly oauth: GoogleOAuthClient, private readonly key: string, private readonly fetchImpl: FetchLike = fetch) {}
  private async token(row: ActionRow): Promise<string> {
    const link = await this.connections.get(row.user_id, "google_calendar");
    if (!link || link.status !== "linked" || !link.external_account_id || link.external_account_id !== row.payload.connectionAccountId) throw new ApiError("not_linked", "Link the Google account shown on this proposal before continuing.");
    const secret = await this.connections.secret(row.user_id, "google_calendar");
    if (!secret || secret.keyVersion !== 1) throw new ApiError("not_linked", "Reconnect Google Calendar.");
    try { return (await this.oauth.refresh(openBox(secret.ciphertext, this.key))).accessToken; }
    catch (error) {
      if (error instanceof GoogleOAuthError && error.providerCode === "invalid_grant") await this.connections.markError(row.user_id, "google_calendar", "invalid_grant");
      throw new ApiError("provider_unavailable", "Could not refresh your Calendar connection. Check Linked apps.");
    }
  }
  private url(row: ActionRow) { return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(row.target_calendar_id)}/events`; }
  async insert(row: ActionRow): Promise<CalendarReceipt> {
    const token = await this.token(row); // no event request has been made if this fails
    const draft = calendarDraftSchema.parse(row.payload);
    const body = { id: row.provider_event_id, summary: draft.title, description: draft.description,
      ...(draft.location ? { location: draft.location } : {}),
      start: { dateTime: draft.startAt, timeZone: draft.timeZone }, end: { dateTime: draft.endAt, timeZone: draft.timeZone },
      reminders: { useDefault: false }, extendedProperties: { private: { nomiActionId: row.id, nomiPayloadHash: row.payload_hash } } };
    let response: Response;
    try { response = await this.fetchImpl(`${this.url(row)}?sendUpdates=none`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) }); }
    catch { throw new CalendarWriteError(true); }
    if (!response.ok) throw new CalendarWriteError(response.status >= 500 || [408, 409, 429].includes(response.status));
    return verifyReceipt(await response.json().catch(() => null), row);
  }
  async get(row: ActionRow): Promise<CalendarReceipt | null> {
    const token = await this.token(row);
    const response = await this.fetchImpl(`${this.url(row)}/${encodeURIComponent(row.provider_event_id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new CalendarWriteError(true);
    return verifyReceipt(await response.json().catch(() => null), row);
  }
}
