import type { MemoryUpdateUI } from "@/types/contracts";
import { Card, CardSection } from "@/components/ui/card";
import { CategoryTag } from "@/components/ui/category-tag";
import { formatLocalDate } from "@/lib/format";

export function MemoryUpdateCard({ data }: { data: MemoryUpdateUI["data"] }) {
  const created = data.changes.filter((c) => c.operation === "created").length;
  const updated = data.changes.length - created;
  const headline =
    created > 0 && updated > 0
      ? `Saved ${created}, updated ${updated}`
      : created > 0
        ? `Saved ${created} ${created === 1 ? "memory" : "memories"}`
        : `Updated ${updated} ${updated === 1 ? "memory" : "memories"}`;

  return (
    <Card aria-label="Memory update">
      <CardSection className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg leading-tight">{headline}</h3>
        <span className="text-xs text-muted">Editable in Memory</span>
      </CardSection>
      <ul className="flex flex-wrap gap-2 px-5 pb-5">
        {data.changes.map(({ operation, memory }) => (
          <li
            key={memory.id}
            className="flex max-w-full flex-col gap-1 rounded-control border border-border bg-canvas px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <CategoryTag category={memory.category} />
              {operation === "updated" && <span className="text-[11px] text-muted">updated</span>}
            </div>
            <span className="text-sm">{memory.summary}</span>
            {memory.expiresAt && <span className="text-[11px] text-muted">until {formatLocalDate(memory.expiresAt)}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
