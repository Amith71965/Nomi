import fixtures from "@/fixtures/ui-responses.json";
import { BlockRenderer } from "@/components/generative-ui/renderer";
import { Reveal } from "@/components/landing/reveal";
import { PRINCIPLES } from "@/components/landing/content";

export function Trust() {
  return (
    <section id="trust" className="scroll-mt-20 border-y border-border bg-text text-canvas">
      <div className="mx-auto grid max-w-[1120px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:py-28">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-canvas/60">Trust</p>
          <h2 className="mt-3 max-w-[18ch] font-display text-[34px] leading-[1.08] sm:text-[44px]">
            You see the action before it happens.
          </h2>
          <ul className="mt-8 space-y-6">
            {PRINCIPLES.map((p) => (
              <li key={p.title} className="grid grid-cols-[20px_1fr] gap-3">
                <span aria-hidden className="mt-2 h-2 w-2 rounded-full bg-accent" />
                <div>
                  <h3 className="font-medium">{p.title}</h3>
                  <p className="mt-1 text-sm text-canvas/70">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal index={1} className="text-text">
          <BlockRenderer block={fixtures.blocks.approval_card} />
        </Reveal>
      </div>
    </section>
  );
}
