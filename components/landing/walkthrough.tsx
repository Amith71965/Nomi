import fixtures from "@/fixtures/ui-responses.json";
import { BlockRenderer } from "@/components/generative-ui/renderer";
import { Reveal } from "@/components/landing/reveal";
import { Badge } from "@/components/ui/badge";

function Stage({ n, title, text, children, index }: { n: string; title: string; text: string; children: React.ReactNode; index: number }) {
  return (
    <Reveal index={index} className="grid gap-6 lg:grid-cols-[280px_1fr] lg:gap-12">
      <div>
        <span className="font-mono text-xs text-muted">{n}</span>
        <h3 className="mt-2 font-display text-[28px] leading-tight">{title}</h3>
        <p className="mt-3 text-sm text-muted">{text}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </Reveal>
  );
}

export function Walkthrough() {
  return (
    <section id="walkthrough" className="scroll-mt-20 border-y border-border bg-surface-2/50 py-20 lg:py-28">
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">One complete example</p>
            <h2 className="mt-3 max-w-[22ch] font-display text-[34px] leading-[1.08] sm:text-[44px]">
              The same five cards, from memory to a real event.
            </h2>
          </div>
          <Badge>Illustrative walkthrough · example data</Badge>
        </Reveal>

        <div className="mt-14 space-y-16">
          <Stage n="Stage 1" title="Research with sources" text="Tap Groceries. Nomi searches each confirmed need separately and shows what it actually found, including the fields it could not verify." index={0}>
            <BlockRenderer block={fixtures.blocks.shopping_results} context={{ recommendedProductId: "res_tomato_01" }} />
          </Stage>

          <Stage n="Stage 2" title="Review the exact event" text="Tap Schedule grocery run. The proposal is stored first and rendered from that stored payload. Nothing has been written yet." index={1}>
            <BlockRenderer block={fixtures.blocks.approval_card} />
          </Stage>

          <Stage n="Stage 3" title="One event, with a real link" text="After Allow, the server claims the proposal once and creates the event. In the product this card only appears with a verified provider receipt." index={2}>
            <div className="relative">
              <div className="absolute -top-3 right-4 z-10">
                <Badge tone="warning">Example only</Badge>
              </div>
              <BlockRenderer block={fixtures.blocks.calendar_confirmation} />
            </div>
          </Stage>
        </div>
      </div>
    </section>
  );
}
