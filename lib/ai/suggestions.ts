import type { SuggestedAction, SuggestedIntentKind } from "@/types/contracts";
import type { Capabilities } from "@/lib/ai/prompts";

/**
 * Allowlisted stage table. The model may ORDER these by naming intents; it
 * cannot invent one. Every chip returned here has a server handler for the
 * current capability set; anything else is simply not offered.
 */
export interface SuggestionInput {
  stage: "memory_saved" | "decision" | "plain";
  capabilities: Capabilities;
  turnId: string;
  hasConfirmedNeeds: boolean;
  hasPlanToday: boolean;
  modelHints: readonly SuggestedIntentKind[];
}

export const SUGGESTION_LABELS: Record<SuggestedIntentKind, string> = {
  research_groceries: "Groceries",
  show_item: "Show item",
  sort_results: "Sort by price",
  review_curry_ingredients: "Check ingredients",
  schedule_grocery_run: "Schedule grocery run",
  open_memory: "View memories",
};

export const SUGGESTED_ACTIONS_MAX = 4;

export function buildSuggestedActions(input: SuggestionInput, newId: () => string): SuggestedAction[] {
  const allowed = new Set<SuggestedIntentKind>();
  if (input.capabilities.research && input.hasConfirmedNeeds) allowed.add("research_groceries");
  if (input.hasPlanToday) allowed.add("review_curry_ingredients");
  if (input.capabilities.calendar && (input.stage === "decision" || input.modelHints.includes("schedule_grocery_run"))) {
    allowed.add("schedule_grocery_run");
  }
  allowed.add("open_memory");

  const ordered: SuggestedIntentKind[] = [];
  for (const hint of input.modelHints) if (allowed.has(hint) && !ordered.includes(hint)) ordered.push(hint);
  for (const kind of ["research_groceries", "review_curry_ingredients", "schedule_grocery_run", "open_memory"] as const) {
    if (allowed.has(kind) && !ordered.includes(kind)) ordered.push(kind);
  }

  return ordered.slice(0, SUGGESTED_ACTIONS_MAX).map((kind) => ({
    id: newId(),
    label: SUGGESTION_LABELS[kind],
    intent: kind === "schedule_grocery_run" ? { kind, sourceTurnId: input.turnId } : kind === "research_groceries" ? { kind } : kind === "review_curry_ingredients" ? { kind } : { kind: "open_memory" },
  }));
}
