import type { DecisionCardUI } from "@/types/contracts";
import { Card, CardDivider, CardSection } from "@/components/ui/card";
import { cn } from "@/lib/cn";

function Column({ title, items, tone }: { title: string; items: string[]; tone: "accent" | "muted" }) {
  return (
    <div className="min-w-0">
      <h4 className={cn("mb-2 font-mono text-[11px] uppercase tracking-[0.08em]", tone === "accent" ? "text-accent" : "text-muted")}>
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted">None</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li
              key={item}
              className={cn(
                "rounded-full border px-2.5 py-1 text-sm",
                tone === "accent" ? "border-transparent bg-accent-soft text-text" : "border-border bg-canvas text-text",
              )}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DecisionCard({ data }: { data: DecisionCardUI["data"] }) {
  return (
    <Card aria-label="Decision">
      <CardSection>
        <h3 className="font-display text-xl leading-tight">{data.title}</h3>
      </CardSection>
      <CardDivider />
      <CardSection className="grid gap-5 sm:grid-cols-3">
        <Column title="Confirmed needs" items={data.confirmedNeeds} tone="accent" />
        <Column title="Suggestions to check" items={data.suggestionsToCheck} tone="muted" />
        <Column title="Other interests" items={data.otherInterests} tone="muted" />
      </CardSection>
      {(data.reasons.length > 0 || data.limitations.length > 0) && (
        <>
          <CardDivider />
          <CardSection className="grid gap-4 sm:grid-cols-2">
            {data.reasons.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {data.reasons.map((r) => (
                  <li key={r} className="flex gap-2">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.limitations.length > 0 && (
              <ul className="space-y-1.5 text-sm text-muted">
                {data.limitations.map((l) => (
                  <li key={l} className="flex gap-2">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardSection>
        </>
      )}
    </Card>
  );
}
