import type { CSSProperties } from "react";
import fixtures from "@/fixtures/ui-responses.json";
import { BlockRenderer } from "@/components/generative-ui/renderer";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { TAGLINE } from "@/components/landing/content";

function Bubble({ children, i }: { children: string; i: number }) {
  return (
    <div className="fade-up flex justify-end" style={{ "--i": i } as CSSProperties}>
      <p className="max-w-[85%] rounded-card rounded-br-md bg-text px-4 py-2.5 text-sm text-canvas">{children}</p>
    </div>
  );
}

function Chip({ label, i }: { label: string; i: number }) {
  return (
    <span
      className="fade-up inline-flex h-8 items-center rounded-full border border-border-strong bg-surface px-3 text-sm"
      style={{ "--i": i } as CSSProperties}
    >
      {label}
    </span>
  );
}

export function Hero() {
  return (
    <section className="grain relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent 70%)" }}
      />
      <div className="mx-auto grid max-w-[1120px] gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pb-28 lg:pt-24">
        <div>
          <Badge tone="accent" className="fade-up" >
            Private preview
          </Badge>
          <h1
            className="fade-up mt-5 font-display text-[44px] leading-[1.02] sm:text-[60px] lg:text-[68px]"
            style={{ "--i": 1 } as CSSProperties}
          >
            {TAGLINE}
          </h1>
          <p className="fade-up mt-6 max-w-[52ch] text-lg text-muted" style={{ "--i": 2 } as CSSProperties}>
            Nomi remembers everyday context, researches useful options with their sources, and helps you act. It asks
            before it changes anything in another app.
          </p>
          <div className="fade-up mt-8 flex flex-wrap gap-3" style={{ "--i": 3 } as CSSProperties}>
            <ButtonLink href="/signup" size="lg">
              Create your account
            </ButtonLink>
            <ButtonLink href="#how" variant="secondary" size="lg">
              See how it works
            </ButtonLink>
          </div>
          <p className="fade-up mt-6 font-mono text-xs text-muted" style={{ "--i": 4 } as CSSProperties}>
            Remember → Understand → Research → Recommend → Ask → Act
          </p>
        </div>

        <div className="relative">
          <div className="absolute -top-3 left-4 z-10">
            <Badge>Illustrative walkthrough</Badge>
          </div>
          <div className="space-y-3 rounded-[20px] border border-border bg-surface-2/70 p-4 shadow-lift sm:p-5">
            <Bubble i={1}>I&apos;m out of tomatoes and potatoes. I&apos;m cooking chicken curry tonight. I&apos;m looking for running shoes.</Bubble>
            <div className="fade-up" style={{ "--i": 3 } as CSSProperties}>
              <BlockRenderer block={fixtures.blocks.memory_update} />
            </div>
            <Bubble i={5}>What should I buy today?</Bubble>
            <div className="fade-up" style={{ "--i": 7 } as CSSProperties}>
              <BlockRenderer block={fixtures.blocks.decision_card} />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Chip label="Groceries" i={9} />
              <Chip label="Schedule grocery run" i={10} />
              <Chip label="View memories" i={11} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
