import type { CalendarDraft } from "@/types/contracts";
import { ApiError } from "@/lib/errors";
import { googleApiErrorSchema, googleEventSchema, type GoogleEvent } from "@/lib/schemas/calendar";

/**
 * Google Calendar writes. Only `createEvent` and `getEvent` exist, and the
 * model can reach neither: the executor is called by the approval route after
 * the database claim succeeds. The event ID is supplied by the caller and
 * reused on every retry, so one approval can only ever produce one event.
 */

export const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export const ACTION_MARKER = "nomiActionId";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CreateEventInput {
  accessToken: string;
  calendarId: string;
  /** Deterministic, derived from the action id. Never regenerated. */
  eventId: string;
  actionId: string;
  draft: CalendarDraft;
  signal?: AbortSignal;
}

export type CreateEventOutcome =
  | { outcome: "created"; event: GoogleEvent }
  | { outcome: "already_exists"; event: GoogleEvent }
  | { outcome: "failed"; code: string; retryable: boolean }
  | { outcome: "unknown"; code: string };

export class GoogleCalendarClient {
  private readonly fetchImpl: FetchLike;

  constructor(options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  private readonly timeoutMs: number;

  eventBody(input: CreateEventInput): Record<string, unknown> {
    return {
      id: input.eventId,
      summary: input.draft.title,
      description: input.draft.description,
      location: input.draft.location ?? undefined,
      start: { dateTime: input.draft.startAt, timeZone: input.draft.timeZone },
      end: { dateTime: input.draft.endAt, timeZone: input.draft.timeZone },
      reminders: { useDefault: false },
      extendedProperties: { private: { [ACTION_MARKER]: input.actionId } },
    };
  }

  /**
   * Insert with the deterministic ID. A duplicate ID comes back as 409, which
   * means the event already exists: that is success for a retry, never a
   * second event. Ambiguous failures return "unknown" so the caller reconciles
   * by ID instead of retrying blindly.
   */
  async createEvent(input: CreateEventInput): Promise<CreateEventOutcome> {
    const url = `${CALENDAR_API}/calendars/${encodeURIComponent(input.calendarId)}/events?sendUpdates=none&conferenceDataVersion=0`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(this.eventBody(input)),
        signal: input.signal ?? AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // The request may or may not have been committed. Reconcile by ID.
      return { outcome: "unknown", code: "network_or_timeout" };
    }

    if (res.status === 200 || res.status === 201) {
      const parsed = googleEventSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) return { outcome: "unknown", code: "unreadable_receipt" };
      return { outcome: "created", event: parsed.data };
    }
    if (res.status === 409) {
      const existing = await this.getEvent({ accessToken: input.accessToken, calendarId: input.calendarId, eventId: input.eventId, signal: input.signal });
      return existing ? { outcome: "already_exists", event: existing } : { outcome: "unknown", code: "duplicate_not_readable" };
    }

    const body = await res.json().catch(() => null);
    const parsed = googleApiErrorSchema.safeParse(body);
    const reason = parsed.success ? (parsed.data.error.errors?.[0]?.reason ?? `http_${res.status}`) : `http_${res.status}`;
    if (res.status === 401 || res.status === 403) return { outcome: "failed", code: reason === "http_401" ? "invalid_grant" : reason, retryable: false };
    if (res.status === 400 || res.status === 404) return { outcome: "failed", code: reason, retryable: false };
    if (res.status === 429 || res.status >= 500) return { outcome: "unknown", code: reason };
    return { outcome: "failed", code: reason, retryable: false };
  }

  /** Read one event by ID. Null when it does not exist or was cancelled. */
  async getEvent(input: { accessToken: string; calendarId: string; eventId: string; signal?: AbortSignal }): Promise<GoogleEvent | null> {
    const url = `${CALENDAR_API}/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${input.accessToken}` }, signal: input.signal ?? AbortSignal.timeout(this.timeoutMs) });
    } catch (cause) {
      throw new ApiError("provider_unavailable", "Could not reach Google Calendar.", { cause });
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new ApiError("provider_error", "Google Calendar returned an error.", { details: { status: res.status } });
    const parsed = googleEventSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return null;
    return parsed.data.status === "cancelled" ? null : parsed.data;
  }
}

/** What gets stored as the provider receipt. No tokens, no full payload echo. */
export function receiptFrom(event: GoogleEvent): Record<string, unknown> {
  return {
    id: event.id,
    htmlLink: typeof event.htmlLink === "string" ? event.htmlLink : null,
    status: event.status ?? null,
    start: event.start?.dateTime ?? null,
    end: event.end?.dateTime ?? null,
  };
}
