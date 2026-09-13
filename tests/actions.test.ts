import { beforeEach, describe, expect, it } from "vitest";
import { payloadHash, providerEventIdFor } from "@/lib/actions/policy";
import { approveAction, cancelAction, reconcileAction } from "@/lib/actions/execute";
import { buildProposal, resolveSlot, toActionView, viewWithExpiry } from "@/lib/actions/proposals";
import { actionViewSchema } from "@/lib/schemas/actions";
import { DRAFT, NOW, TURN, linkCalendar, makeDeps, seedProposal } from "./helpers/fake-actions";
import { USER_A, USER_B } from "./helpers/fake-stores";

const NY = "America/New_York";

describe("proposal building", () => {
  it("stores the exact payload with a stable hash, a deterministic event id, and a 10-minute expiry", () => {
    const actionId = "33333333-3333-4333-8333-333333333333";
    const input = buildProposal({ sourceTurnId: TURN, intentKind: "schedule_grocery_run", draft: DRAFT, targetCalendarId: "primary", now: NOW, actionId });
    expect(input.payload).toEqual(DRAFT);
    expect(input.payloadHash).toBe(payloadHash(DRAFT));
    expect(input.providerEventId).toBe(providerEventIdFor(actionId));
    expect(Date.parse(input.expiresAt) - NOW.getTime()).toBe(10 * 60 * 1000);
    expect(input.proposalKey).toBe(`${TURN}:schedule_grocery_run`);
  });

  it("refuses a past time instead of rolling it to tomorrow", () => {
    expect(resolveSlot({ startAt: "2026-09-13T10:00:00-04:00", endAt: null, timeZone: NY, now: NOW })).toEqual({ ok: false, reason: "past" });
    expect(resolveSlot({ startAt: "not a time", endAt: null, timeZone: NY, now: NOW })).toEqual({ ok: false, reason: "unparseable" });
    const future = resolveSlot({ startAt: "2026-09-14T17:30:00-04:00", endAt: null, timeZone: NY, now: NOW });
    expect(future.ok && Date.parse(future.endAt) - Date.parse(future.startAt)).toBe(30 * 60 * 1000);
  });

  it("never reports a link or an event before one exists", async () => {
    const { actions } = makeDeps();
    const row = await seedProposal(actions, USER_A);
    const view = actionViewSchema.parse(toActionView(row));
    expect(view).toMatchObject({ status: "proposed", eventId: null, eventUrl: null, executedAt: null, version: 1, level: 2 });
    const later = new Date(NOW.getTime() + 11 * 60 * 1000);
    expect(viewWithExpiry(row, later).status).toBe("expired");
  });
});

describe("approval", () => {
  let ctx: ReturnType<typeof makeDeps>;
  beforeEach(async () => {
    ctx = makeDeps();
    await linkCalendar(ctx.connections, USER_A);
  });

  it("creates exactly one event and returns the real link", async () => {
    const row = await seedProposal(ctx.actions, USER_A);
    const view = await approveAction(ctx.deps, USER_A, row.id, 1);
    expect(actionViewSchema.parse(view)).toMatchObject({ status: "succeeded", eventId: row.provider_event_id });
    expect(view.eventUrl).toContain("calendar.google.com");
    expect(ctx.fake.inserts).toBe(1);
    expect(ctx.fake.events.size).toBe(1);
  });

  it("a second approve of the same proposal is refused and writes nothing more", async () => {
    const row = await seedProposal(ctx.actions, USER_A);
    await approveAction(ctx.deps, USER_A, row.id, 1);
    await expect(approveAction(ctx.deps, USER_A, row.id, 1)).rejects.toMatchObject({ code: "stale_proposal" });
    expect(ctx.fake.inserts).toBe(1);
  });

  it("two concurrent approvals produce one claim and one event", async () => {
    const row = await seedProposal(ctx.actions, USER_A);
    const [a, b] = await Promise.allSettled([approveAction(ctx.deps, USER_A, row.id, 1), approveAction(ctx.deps, USER_A, row.id, 1)]);
    const fulfilled = [a, b].filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect(ctx.fake.inserts).toBe(1);
  });

  it("a stale version, an expired proposal, a cancelled proposal, and an unowned id all create nothing", async () => {
    const stale = await seedProposal(ctx.actions, USER_A);
    await expect(approveAction(ctx.deps, USER_A, stale.id, 2)).rejects.toMatchObject({ code: "stale_proposal" });

    const expired = await seedProposal(ctx.actions, USER_A, { ...DRAFT, title: "Expired run" }, new Date(NOW.getTime() - 20 * 60 * 1000));
    await expect(approveAction(ctx.deps, USER_A, expired.id, 1)).rejects.toMatchObject({ code: "expired_proposal" });

    const cancelled = await seedProposal(ctx.actions, USER_A, { ...DRAFT, title: "Cancelled run" });
    await cancelAction(ctx.deps, USER_A, cancelled.id, 1);
    await expect(approveAction(ctx.deps, USER_A, cancelled.id, 1)).rejects.toMatchObject({ code: "stale_proposal" });

    await expect(approveAction(ctx.deps, USER_B, stale.id, 1)).rejects.toMatchObject({ code: "not_found" });
    expect(ctx.fake.inserts).toBe(0);
  });

  it("cancel wins a race against approve: zero writes", async () => {
    const row = await seedProposal(ctx.actions, USER_A);
    ctx.actions.onBeforeClaimWrite = async () => {
      await cancelAction(ctx.deps, USER_A, row.id, 1);
    };
    await expect(approveAction(ctx.deps, USER_A, row.id, 1)).rejects.toMatchObject({ code: "stale_proposal" });
    expect(ctx.fake.inserts).toBe(0);
    expect((await ctx.actions.get(USER_A, row.id))?.status).toBe("cancelled");
  });

  it("a user with no linked calendar is refused before anything is written", async () => {
    const row = await seedProposal(ctx.actions, USER_B);
    await expect(approveAction(ctx.deps, USER_B, row.id, 1)).rejects.toMatchObject({ code: "not_linked" });
    expect(ctx.fake.inserts).toBe(0);
    expect((await ctx.actions.get(USER_B, row.id))?.status).toBe("failed");
  });

  it("an expired grant marks the link as needing attention and fails honestly", async () => {
    ctx.fake.refreshFails = "invalid_grant";
    const row = await seedProposal(ctx.actions, USER_A);
    await expect(approveAction(ctx.deps, USER_A, row.id, 1)).rejects.toMatchObject({ code: "provider_error" });
    expect(ctx.fake.inserts).toBe(0);
    expect((await ctx.connections.get(USER_A, "google_calendar"))?.status).toBe("error");
    expect((await ctx.actions.get(USER_A, row.id))?.status).toBe("failed");
  });

  it("a provider refusal is failed, not unknown, and claims no event", async () => {
    ctx.fake.behaviour = "forbidden";
    const row = await seedProposal(ctx.actions, USER_A);
    const view = await approveAction(ctx.deps, USER_A, row.id, 1);
    expect(view).toMatchObject({ status: "failed", eventId: null, eventUrl: null, errorCode: "insufficientPermissions" });
  });
});

describe("timeout and reconciliation", () => {
  it("a timeout after the event was committed reconciles to the same event, never a second one", async () => {
    const ctx = makeDeps({ behaviour: "network" });
    await linkCalendar(ctx.connections, USER_A);
    const row = await seedProposal(ctx.actions, USER_A);
    // The insert reaches Google and commits, but the response never arrives.
    ctx.fake.events.set(row.provider_event_id, { id: row.provider_event_id, htmlLink: `https://calendar.google.com/event?eid=${row.provider_event_id}`, summary: DRAFT.title });
    const view = await approveAction(ctx.deps, USER_A, row.id, 1);
    expect(view.status).toBe("succeeded");
    expect(view.eventId).toBe(row.provider_event_id);
    expect(ctx.fake.events.size).toBe(1);
    expect(ctx.fake.inserts).toBe(1);
  });

  it("a timeout with nothing committed settles as failed after reconciliation", async () => {
    const ctx = makeDeps({ behaviour: "network" });
    await linkCalendar(ctx.connections, USER_A);
    const row = await seedProposal(ctx.actions, USER_A);
    const view = await approveAction(ctx.deps, USER_A, row.id, 1);
    expect(view.status).toBe("failed");
    expect(view.eventId).toBeNull();
    expect(ctx.fake.events.size).toBe(0);
  });

  it("a retry after a duplicate id reports success without inserting twice", async () => {
    const ctx = makeDeps({ behaviour: "conflict" });
    await linkCalendar(ctx.connections, USER_A);
    const row = await seedProposal(ctx.actions, USER_A);
    const view = await approveAction(ctx.deps, USER_A, row.id, 1);
    expect(view.status).toBe("succeeded");
    expect(ctx.fake.events.size).toBe(1);
  });

  it("Check status on a settled action returns its real state and inserts nothing", async () => {
    const ctx = makeDeps();
    await linkCalendar(ctx.connections, USER_A);
    const row = await seedProposal(ctx.actions, USER_A);
    await approveAction(ctx.deps, USER_A, row.id, 1);
    const again = await reconcileAction(ctx.deps, USER_A, row.id);
    expect(again.status).toBe("succeeded");
    expect(ctx.fake.inserts).toBe(1);
    await expect(reconcileAction(ctx.deps, USER_B, row.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("cancel", () => {
  it("cancels a proposal once and reports the real state afterwards", async () => {
    const ctx = makeDeps();
    await linkCalendar(ctx.connections, USER_A);
    const row = await seedProposal(ctx.actions, USER_A);
    expect((await cancelAction(ctx.deps, USER_A, row.id, 1)).status).toBe("cancelled");
    expect((await cancelAction(ctx.deps, USER_A, row.id, 1)).status).toBe("cancelled");
    await expect(cancelAction(ctx.deps, USER_B, row.id, 1)).rejects.toMatchObject({ code: "not_found" });
    expect(ctx.fake.inserts).toBe(0);
  });
});
