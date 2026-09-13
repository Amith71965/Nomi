import type { CalendarDraft } from "@/types/contracts";
import { buildProposal } from "@/lib/actions/proposals";
import { InMemoryActionStore } from "@/lib/actions/store";
import { InMemoryConnectionStore } from "@/lib/connections/store";
import { sealBox } from "@/lib/crypto";
import type { ExecuteDeps } from "@/lib/actions/execute";
import { GoogleCalendarClient } from "@/lib/integrations/calendar";
import { GOOGLE_TOKEN_URL, GoogleOAuthClient } from "@/lib/integrations/google-oauth";
import { CALENDAR_API } from "@/lib/integrations/calendar";

export const NOW = new Date("2026-09-13T18:00:00.000Z");
export const KEY = Buffer.alloc(32, 9).toString("base64");
export const TURN = "22222222-2222-4222-8222-222222222222";

export const DRAFT: CalendarDraft = {
  title: "Grocery run",
  startAt: "2026-09-13T17:30:00-04:00",
  endAt: "2026-09-13T18:00:00-04:00",
  timeZone: "America/New_York",
  calendarLabel: "Primary calendar · person@example.com",
  location: null,
  description: "Tomatoes, potatoes",
};

export interface CalendarFake {
  /** How many insert attempts reached the provider. */
  inserts: number;
  /** Event ids that exist on the fake calendar. */
  events: Map<string, { id: string; htmlLink: string; summary: string }>;
  /** Next insert outcome. */
  behaviour: "ok" | "conflict" | "server_error" | "network" | "forbidden";
  refreshFails: "no" | "invalid_grant";
}

export function makeDeps(overrides: Partial<CalendarFake> = {}) {
  const fake: CalendarFake = { inserts: 0, events: new Map(), behaviour: "ok", refreshFails: "no", ...overrides };
  const actions = new InMemoryActionStore(() => NOW);
  const connections = new InMemoryConnectionStore(() => NOW);

  const fetchImpl = async (url: string, init?: RequestInit) => {
    if (url === GOOGLE_TOKEN_URL) {
      if (fake.refreshFails === "invalid_grant") {
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ access_token: "ya29.fresh", expires_in: 3599, scope: "https://www.googleapis.com/auth/calendar.events" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith(`${CALENDAR_API}/calendars/`) && init?.method === "POST") {
      fake.inserts += 1;
      const body = JSON.parse(String(init.body)) as { id: string; summary: string };
      if (fake.behaviour === "network") throw new TypeError("connection reset");
      if (fake.behaviour === "server_error") return new Response(JSON.stringify({ error: { code: 503 } }), { status: 503, headers: { "content-type": "application/json" } });
      if (fake.behaviour === "forbidden") {
        return new Response(JSON.stringify({ error: { code: 403, errors: [{ reason: "insufficientPermissions" }] } }), { status: 403, headers: { "content-type": "application/json" } });
      }
      if (fake.behaviour === "conflict" || fake.events.has(body.id)) {
        if (!fake.events.has(body.id)) fake.events.set(body.id, { id: body.id, htmlLink: `https://calendar.google.com/event?eid=${body.id}`, summary: body.summary });
        return new Response(JSON.stringify({ error: { code: 409, errors: [{ reason: "duplicate" }] } }), { status: 409, headers: { "content-type": "application/json" } });
      }
      const event = { id: body.id, htmlLink: `https://calendar.google.com/event?eid=${body.id}`, summary: body.summary, status: "confirmed" };
      fake.events.set(body.id, event);
      return new Response(JSON.stringify(event), { status: 200, headers: { "content-type": "application/json" } });
    }
    // GET one event by id
    const id = url.split("/events/")[1];
    const found = id ? fake.events.get(decodeURIComponent(id)) : undefined;
    return found
      ? new Response(JSON.stringify({ ...found, status: "confirmed" }), { status: 200, headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({ error: { code: 404 } }), { status: 404, headers: { "content-type": "application/json" } });
  };

  const deps: ExecuteDeps = {
    actions,
    connections,
    calendar: new GoogleCalendarClient({ fetchImpl }),
    google: new GoogleOAuthClient({ clientId: "id", clientSecret: "secret", redirectUri: "http://localhost:3000/cb", fetchImpl }),
    encryptionKey: KEY,
    now: () => NOW,
  };
  return { deps, actions, connections, fake };
}

export async function linkCalendar(connections: InMemoryConnectionStore, userId: string): Promise<void> {
  await connections.link(userId, {
    provider: "google_calendar",
    accountEmail: "person@example.com",
    accountLabel: "Primary calendar · person@example.com",
    externalAccountId: "sub",
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
    targetId: "primary",
    refreshTokenCiphertext: sealBox("1//refresh", KEY),
    keyVersion: 1,
  });
}

let turnSeq = 0;

/** Each call gets its own source turn, so proposals do not share a proposal key. */
export async function seedProposal(actions: InMemoryActionStore, userId: string, draft: CalendarDraft = DRAFT, now: Date = NOW) {
  turnSeq += 1;
  const sourceTurnId = `22222222-2222-4222-8222-${turnSeq.toString().padStart(12, "0")}`;
  const actionId = actions.newId();
  return actions.create(userId, buildProposal({ sourceTurnId, intentKind: "schedule_grocery_run", draft, targetCalendarId: "primary", now, actionId }));
}
