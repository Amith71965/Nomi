import { Reveal } from "@/components/landing/reveal";
import { ButtonLink } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-[1120px] px-5 pb-24 sm:px-8">
      <Reveal>
        <div className="grain relative overflow-hidden rounded-[24px] border border-border bg-surface px-6 py-14 text-center shadow-soft sm:px-12 sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -bottom-32 mx-auto h-64 w-[70%] rounded-full opacity-70 blur-3xl"
            style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent 70%)" }}
          />
          <h2 className="relative mx-auto max-w-[18ch] font-display text-[36px] leading-[1.05] sm:text-[52px]">
            Keep the context. Take the next step.
          </h2>
          <p className="relative mx-auto mt-5 max-w-[46ch] text-muted">
            Start with the things you need to remember today. Nomi will bring them back when it&apos;s time to decide.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/app" size="lg">
              Start with Nomi
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary" size="lg">
              Sign in
            </ButtonLink>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
