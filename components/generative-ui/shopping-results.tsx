import type { Product, ShoppingResultsUI } from "@/types/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardSection } from "@/components/ui/card";
import { ModeBadge } from "@/components/ui/mode-badge";
import { cn } from "@/lib/cn";
import { formatLocalTime, formatPrice, formatRating } from "@/lib/format";

export interface ShoppingResultsHandlers {
  onSelectItem?: (itemKey: string) => void;
}

function ProductImage({ product }: { product: Product }) {
  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-control border border-border bg-surface-2">
      {product.imageUrl ? (
        // Provider imagery for the corresponding product only; fixed size prevents layout shift.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.imageUrl} alt="" width={64} height={64} className="h-16 w-16 object-cover" loading="lazy" />
      ) : (
        <svg aria-hidden viewBox="0 0 64 64" className="h-16 w-16 text-border-strong">
          <path d="M20 40c0-8 5-14 12-14s12 6 12 14-5 10-12 10-12-2-12-10Z" fill="currentColor" />
          <path d="M32 26c0-6 4-10 8-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
      )}
    </div>
  );
}

function ProductCard({ product, recommended }: { product: Product; recommended: boolean }) {
  const price = formatPrice(product.priceAmount, product.currency);
  const rating = formatRating(product.rating, product.reviewCount);
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-card border bg-surface p-4",
        recommended ? "border-accent shadow-soft" : "border-border",
      )}
    >
      <div className="flex gap-3">
        <ProductImage product={product} />
        <div className="min-w-0 flex-1">
          {recommended && (
            <Badge tone="accent" className="mb-1">
              Recommended
            </Badge>
          )}
          <p className="line-clamp-2 text-sm font-medium leading-snug">{product.title}</p>
          <p className="truncate text-xs text-muted">{product.merchant || "Merchant not listed"}</p>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        {price ? (
          <p className="text-lg font-semibold tabular-nums">
            {price}
            {product.unitLabel && <span className="ml-1 text-xs font-normal text-muted">/ {product.unitLabel}</span>}
          </p>
        ) : (
          <p className="text-sm text-muted">Price not listed</p>
        )}
        {rating ? <p className="text-xs text-muted tabular-nums">★ {rating}</p> : null}
      </div>

      <p className="text-sm text-muted">{product.reason}</p>

      <details className="text-xs text-muted">
        <summary className="cursor-pointer select-none">Evidence and comparison</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
          <dt>Source</dt>
          <dd className="truncate">{product.evidence.sourceName}</dd>
          <dt>Retrieved</dt>
          <dd>{formatLocalTime(product.evidence.retrievedAt)}</dd>
          <dt>Stock</dt>
          <dd>{product.availability === "unknown" ? "unknown" : product.availability.replace("_", " ")}</dd>
          <dt>Fulfilment</dt>
          <dd>{product.fulfillment}</dd>
          {product.normalizedPricePerKg !== null && (
            <>
              <dt>Per kg</dt>
              <dd>${product.normalizedPricePerKg.toFixed(2)}</dd>
            </>
          )}
          <dt>Score</dt>
          <dd>
            {product.score ?? "—"} · coverage {Math.round(product.scoreCoverage * 100)}%
          </dd>
        </dl>
      </details>

      <a
        href={product.destinationUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto inline-flex h-9 items-center justify-center rounded-control border border-border-strong bg-surface text-sm font-medium transition-colors hover:bg-surface-2"
      >
        {product.destinationKind === "merchant" ? "Buy at merchant" : "View listing"}
      </a>
    </li>
  );
}

export function ShoppingResultsCard({
  data,
  recommendedProductId = null,
  handlers,
}: {
  data: ShoppingResultsUI["data"];
  recommendedProductId?: string | null;
  handlers?: ShoppingResultsHandlers;
}) {
  const visible = data.products.filter((p) => p.itemKey === data.selectedItemKey).slice(0, 3);
  const mode = visible[0]?.evidence.mode ?? data.products[0]?.evidence.mode ?? "fixture";

  return (
    <Card aria-label="Shopping results">
      <CardSection className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role={handlers?.onSelectItem ? "tablist" : undefined}>
          {data.items.map((item) => {
            const selected = item.key === data.selectedItemKey;
            const className = cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              selected ? "border-transparent bg-text text-canvas" : "border-border bg-canvas text-muted hover:text-text",
            );
            return handlers?.onSelectItem ? (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={selected}
                className={className}
                onClick={() => handlers.onSelectItem?.(item.key)}
              >
                {item.label}
              </button>
            ) : (
              <span key={item.key} className={className} aria-current={selected ? "true" : undefined}>
                {item.label}
              </span>
            );
          })}
        </div>
        <ModeBadge mode={mode} />
      </CardSection>

      {data.notice && <p className="border-t border-border bg-surface-2 px-5 py-2 text-xs text-muted">{data.notice}</p>}

      {visible.length === 0 ? (
        <CardSection>
          <p className="text-sm text-muted">No relevant listings were found for this item.</p>
        </CardSection>
      ) : (
        <ul className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <ProductCard key={p.id} product={p} recommended={p.id === recommendedProductId} />
          ))}
        </ul>
      )}
    </Card>
  );
}
