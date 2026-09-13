import type { z } from "zod";
import type { ApprovalCardUI } from "@/types/contracts";
import { toActionView, resolveSlot } from "@/lib/actions/proposals";
import { buildProposal } from "@/lib/actions/proposals";
import type { ActionStore } from "@/lib/actions/store";
import { calendarDraftSchema } from "@/lib/schemas/actions";
import type { proposeCalendarEventArgsSchema } from "@/lib/schemas/tools";
import { isValidTimeZone } from "@/lib/time";

export type ProposeCalendarEventArgs = z.infer<typeof proposeCalendarEventArgsSchema>;

export interface ProposalContext {
  userId: string;
  turnId: string;
  timeZone: string;
  now: Date;
  store: ActionStore;
  /** Label shown on the card, e.g. the linked account's calendar. */
  calendarLabel: string;
  calendarId: string;
  newId: () => string;
  /** Filled by the handler so the orchestrator can render the card and set requested_action. */
  proposed: ApprovalCardUI | null;
}

/**
 * `propose_calendar_event` produces an approval card and nothing else. It
 * never contacts a provider. The stored payload is what the user will see and
 * approve; the model cannot set the status, the expiry, or the event id.
 */
export async function proposeCalendarEventTool(args: ProposeCalendarEventArgs, ctx: ProposalContext) {
  const timeZone = isValidTimeZone(args.time_zone) ? args.time_zone : ctx.timeZone;
  const slot = resolveSlot({ startAt: args.start_at, endAt: args.end_at, timeZone, now: ctx.now });
  if (!slot.ok) {
    return {
      error: "time_not_usable",
      reason: slot.reason,
      detail:
        slot.reason === "past"
          ? "That time has already passed. Ask the user for a future time; do not move it to another day yourself."
          : slot.reason === "no_default_slot"
            ? "The default 5:30 PM slot has already passed today. Ask the user what time they want."
            : "That start time could not be understood. Ask the user for a date and time.",
    };
  }

  const draft = calendarDraftSchema.safeParse({
    title: args.title,
    startAt: slot.startAt,
    endAt: slot.endAt,
    timeZone,
    calendarLabel: ctx.calendarLabel,
    location: args.location && args.location.trim().length > 0 ? args.location.trim() : null,
    description: args.description,
  });
  if (!draft.success) return { error: "invalid_draft", detail: "The proposed event did not validate." };

  const actionId = ctx.newId();
  const row = await ctx.store.create(ctx.userId, buildProposal({ sourceTurnId: ctx.turnId, intentKind: "schedule_grocery_run", draft: draft.data, targetCalendarId: ctx.calendarId, now: ctx.now, actionId }));
  const view = toActionView(row);

  ctx.proposed = {
    type: "approval_card",
    data: { actionId: view.id, version: view.version, kind: "calendar.create", level: 2, expiresAt: view.expiresAt, status: "proposed", preview: view.preview },
  };

  return {
    action_id: view.id,
    version: view.version,
    status: view.status,
    expires_at: view.expiresAt,
    preview: view.preview,
    note: "An approval card is now shown to the user. Nothing has been created. Do not claim the event exists; tell the user to review and press Allow.",
  };
}
