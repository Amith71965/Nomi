import type { Category } from "@/types/contracts";
import { cn } from "@/lib/cn";

const LABEL: Record<Category, string> = {
  inventory: "Inventory",
  plan: "Plan",
  shopping_interest: "Interest",
  task: "Task",
  preference: "Preference",
};

const DOT: Record<Category, string> = {
  inventory: "bg-accent",
  plan: "bg-warning",
  shopping_interest: "bg-muted",
  task: "bg-success",
  preference: "bg-border-strong",
};

export function categoryLabel(category: Category): string {
  return LABEL[category];
}

export function CategoryTag({ category, className }: { category: Category; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted", className)}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", DOT[category])} />
      {LABEL[category]}
    </span>
  );
}
