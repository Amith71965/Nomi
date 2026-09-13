import { ApprovalCard, type ApprovalHandlers } from "@/components/generative-ui/approval-card";
import { CalendarConfirmationCard } from "@/components/generative-ui/calendar-confirmation";
import { DecisionCard } from "@/components/generative-ui/decision-card";
import { MemoryUpdateCard } from "@/components/generative-ui/memory-update";
import { resolveBlock } from "@/components/generative-ui/registry";
import { ShoppingResultsCard, type ShoppingResultsHandlers } from "@/components/generative-ui/shopping-results";
import { Button } from "@/components/ui/button";
import { Card, CardSection } from "@/components/ui/card";

export interface RendererContext {
  approval?: ApprovalHandlers;
  shopping?: ShoppingResultsHandlers;
  recommendedProductId?: string | null;
  onRetry?: () => void;
}

/** Validates first, then renders from the local registry. Unknown blocks become a text notice with Retry. */
export function BlockRenderer({ block, context = {} }: { block: unknown; context?: RendererContext }) {
  const resolved = resolveBlock(block);
  if (resolved.kind === "unknown") {
    return (
      <Card role="status" className="border-warning/40">
        <CardSection className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {resolved.reason === "unknown_type"
              ? "This response used a card type the app does not support."
              : "This card's data did not validate, so it was not shown."}
          </p>
          {context.onRetry && (
            <Button variant="secondary" size="sm" onClick={context.onRetry}>
              Retry
            </Button>
          )}
        </CardSection>
      </Card>
    );
  }

  const b = resolved.block;
  switch (b.type) {
    case "memory_update":
      return <MemoryUpdateCard data={b.data} />;
    case "shopping_results":
      return <ShoppingResultsCard data={b.data} recommendedProductId={context.recommendedProductId ?? null} handlers={context.shopping} />;
    case "decision_card":
      return <DecisionCard data={b.data} />;
    case "approval_card":
      return <ApprovalCard data={b.data} handlers={context.approval} />;
    case "calendar_confirmation":
      return <CalendarConfirmationCard data={b.data} />;
  }
}
