import { Reveal } from "@/components/landing/reveal";
import { INTEGRATIONS, STATUS_HELP, STATUS_LABEL, type IntegrationStatus } from "@/components/landing/content";
import { Badge, type BadgeTone } from "@/components/ui/badge";

const TONE: Record<IntegrationStatus, BadgeTone> = {
  live: "success",
  in_build: "accent",
  external_link: "neutral",
  planned: "neutral",
  not_planned: "neutral",
};

export function Integrations() {
  return (
    <section id="integrations" className="mx-auto max-w-[1120px] scroll-mt-20 px-5 py-20 sm:px-8 lg:py-28">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">Connected applications</p>
        <h2 className="mt-3 max-w-[22ch] font-display text-[34px] leading-[1.08] sm:text-[44px]">
          Your context, connected to the next action.
        </h2>
        <p className="mt-4 max-w-[60ch] text-muted">
          Every badge below is honest. &ldquo;Live&rdquo; is only shown after the real provider has been verified end to end.
        </p>
      </Reveal>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATIONS.map((item, i) => (
          <Reveal key={item.name} index={i}>
            <li className="flex h-full flex-col gap-3 rounded-card border border-border bg-surface p-6">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-xl">{item.name}</h3>
                <Badge tone={TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
              </div>
              <p className="text-sm text-muted">{item.text}</p>
              <p className="mt-auto pt-2 font-mono text-[11px] text-muted">{STATUS_HELP[item.status]}</p>
            </li>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
