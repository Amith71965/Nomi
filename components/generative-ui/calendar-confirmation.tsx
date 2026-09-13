import type { CalendarConfirmationUI } from "@/types/contracts";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardDivider, CardSection } from "@/components/ui/card";
import { CalendarDraftFields } from "@/components/generative-ui/approval-card";
import { formatLocalTime } from "@/lib/format";

/** Rendered only from a verified provider receipt. There is no fixture path in production. */
export function CalendarConfirmationCard({ data }: { data: CalendarConfirmationUI["data"] }) {
  return (
    <Card aria-label="Calendar confirmation" className="border-success/40">
      <CardSection className="flex flex-wrap items-start justify-between gap-3 bg-success-soft/60">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-success text-accent-foreground">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m4 10 4 4 8-8" />
            </svg>
          </span>
          <div>
            <h3 className="font-display text-xl leading-tight">Added to Google Calendar</h3>
            <p className="text-xs text-muted">Verified {formatLocalTime(data.verifiedAt)} · event {data.eventId.slice(0, 8)}…</p>
          </div>
        </div>
        <Badge tone="success">Live</Badge>
      </CardSection>
      <CardDivider />
      <CardSection>
        <CalendarDraftFields draft={data.event} />
      </CardSection>
      <CardDivider />
      <CardSection className="flex justify-end">
        <ButtonLink href={data.eventUrl} external size="sm">
          Open in Google Calendar
        </ButtonLink>
      </CardSection>
    </Card>
  );
}
