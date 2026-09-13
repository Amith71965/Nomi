import type { ApprovalCardUI, CalendarDraft } from "@/types/contracts";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDivider, CardSection } from "@/components/ui/card";
import { formatLocalDate, formatLocalTime, formatTimeRange, formatZone } from "@/lib/format";

export interface ApprovalHandlers {
  onAllow: () => void;
  onChange: () => void;
  onCancel: () => void;
  onCheckStatus?: () => void;
  busy?: boolean;
}

type Status = ApprovalCardUI["data"]["status"];

const STATUS_LABEL: Record<Status, string> = {
  proposed: "Awaiting your approval",
  executing: "Adding to your calendar…",
  cancelled: "Cancelled — nothing was created",
  expired: "Expired — nothing was created",
  failed: "Failed — nothing was created",
  unknown: "Unable to confirm — check status",
};

const STATUS_TONE: Record<Status, BadgeTone> = {
  proposed: "accent",
  executing: "warning",
  cancelled: "neutral",
  expired: "neutral",
  failed: "danger",
  unknown: "warning",
};

export function CalendarDraftFields({ draft }: { draft: CalendarDraft }) {
  return (
    <dl className="grid grid-cols-[minmax(84px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted">Title</dt>
      <dd className="font-medium">{draft.title}</dd>
      <dt className="text-muted">When</dt>
      <dd>
        {formatLocalDate(draft.startAt)} · {formatTimeRange(draft.startAt, draft.endAt)}
        <span className="ml-1 text-muted">({formatZone(draft.timeZone)} time)</span>
      </dd>
      <dt className="text-muted">Calendar</dt>
      <dd>{draft.calendarLabel}</dd>
      {draft.location && (
        <>
          <dt className="text-muted">Location</dt>
          <dd>{draft.location}</dd>
        </>
      )}
      <dt className="text-muted">Description</dt>
      <dd className="whitespace-pre-wrap text-muted">{draft.description || "—"}</dd>
      <dt className="text-muted">Attendees</dt>
      <dd className="text-muted">None · no reminders · no notifications</dd>
    </dl>
  );
}

/**
 * The exact stored payload, rendered before anything is written. Without
 * handlers it is a labelled preview with inert controls (landing page).
 * It is never green: success has its own component.
 */
export function ApprovalCard({ data, handlers }: { data: ApprovalCardUI["data"]; handlers?: ApprovalHandlers }) {
  const preview = handlers === undefined;
  const actionable = data.status === "proposed" && !preview;

  return (
    <Card aria-label="Approval request" className="border-border-strong">
      <CardSection className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Create calendar event · level {data.level} approval</p>
          <h3 className="mt-1 font-display text-xl leading-tight">Add this to your calendar?</h3>
        </div>
        <Badge tone={STATUS_TONE[data.status]}>{STATUS_LABEL[data.status]}</Badge>
      </CardSection>
      <CardDivider />
      <CardSection>
        <CalendarDraftFields draft={data.preview} />
      </CardSection>
      <CardDivider />
      <CardSection className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {data.status === "proposed"
            ? `Proposal v${data.version} · expires ${formatLocalTime(data.expiresAt)}`
            : `Proposal v${data.version}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {["unknown", "executing", "proposed"].includes(data.status) && handlers?.onCheckStatus && (
            <Button variant="secondary" size="sm" onClick={handlers.onCheckStatus} disabled={handlers.busy}>
              Check status
            </Button>
          )}
          {(data.status === "proposed" || preview) && (
            <>
              <Button variant="quiet" size="sm" onClick={handlers?.onCancel} disabled={!actionable || handlers?.busy}>
                Cancel
              </Button>
              <Button variant="secondary" size="sm" onClick={handlers?.onChange} disabled={!actionable || handlers?.busy}>
                Change
              </Button>
              <Button variant="primary" size="sm" onClick={handlers?.onAllow} disabled={!actionable || handlers?.busy}>
                Allow
              </Button>
            </>
          )}
        </div>
      </CardSection>
      {preview && (
        <p className="border-t border-border bg-surface-2 px-5 py-2 text-center text-xs text-muted">
          Preview — nothing is created from this page.
        </p>
      )}
    </Card>
  );
}
