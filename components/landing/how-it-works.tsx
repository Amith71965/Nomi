import { Reveal } from "@/components/landing/reveal";
import { STEPS } from "@/components/landing/content";

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-[1120px] scroll-mt-20 px-5 py-20 sm:px-8 lg:py-28">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">How it works</p>
        <h2 className="mt-3 max-w-[24ch] font-display text-[34px] leading-[1.08] sm:text-[44px]">
          From a passing thought to a useful next step.
        </h2>
      </Reveal>
      <ol className="mt-12 grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal key={step.name} index={i} className="bg-surface">
            <li className="flex h-full flex-col gap-3 p-6">
              <span className="font-mono text-xs text-muted">0{i + 1}</span>
              <h3 className="font-display text-2xl">{step.name}</h3>
              <p className="text-sm text-muted">{step.text}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
