import { Reveal } from "@/components/landing/reveal";
import { FAQ } from "@/components/landing/content";

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-[1120px] scroll-mt-20 px-5 py-20 sm:px-8 lg:py-28">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">Questions</p>
          <h2 className="mt-3 max-w-[14ch] font-display text-[34px] leading-[1.08] sm:text-[44px]">
            Plain answers.
          </h2>
        </Reveal>
        <Reveal index={1}>
          <dl className="divide-y divide-border rounded-card border border-border bg-surface">
            {FAQ.map((item) => (
              <details key={item.q} className="group px-6 py-4 open:bg-surface-2/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-1 font-medium">
                  <span>{item.q}</span>
                  <span aria-hidden className="text-muted transition-transform duration-[var(--motion)] group-open:rotate-45">
                    +
                  </span>
                </summary>
                <dd className="pb-2 pt-2 text-sm text-muted">{item.a}</dd>
              </details>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
