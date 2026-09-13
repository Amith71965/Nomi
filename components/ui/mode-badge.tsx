import type { DataMode } from "@/types/contracts";
import { Badge, type BadgeTone } from "@/components/ui/badge";

const LABEL: Record<DataMode, string> = {
  live: "Live",
  cached: "Cached",
  fixture: "Illustrative demo data",
};

const TONE: Record<DataMode, BadgeTone> = {
  live: "success",
  cached: "warning",
  fixture: "neutral",
};

/** Research mode is always visible. Fixture data can never look live. */
export function ModeBadge({ mode }: { mode: DataMode }) {
  return <Badge tone={TONE[mode]}>{LABEL[mode]}</Badge>;
}
