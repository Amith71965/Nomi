import type { IntegrationView } from "@/types/contracts";
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE } from "@/components/connections/copy";
import { UnlinkButton } from "@/components/connections/unlink-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClasses } from "@/components/ui/button";

function linkedOn(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * One integration. Copy comes from the catalogue; status, account, and the
 * available actions come from the server view. A Connect link only exists
 * when the server offered a connect path, so nothing here can be a dead button.
 */
export function IntegrationCard({ item }: { item: IntegrationView }) {
  const quiet = item.kind === "planned" || item.kind === "never";
  const when = linkedOn(item.linkedAt);

  return (
    <li
      className={`flex h-full flex-col gap-4 rounded-card border bg-surface p-6 ${
        item.status === "linked" ? "border-success/40 shadow-soft" : item.status === "error" ? "border-warning/50" : "border-border"
      } ${quiet ? "opacity-80" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{KIND_LABEL[item.kind]}</p>
          <h3 className="mt-1 font-display text-xl">{item.name}</h3>
        </div>
        <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
      </div>

      <p className="text-sm text-text/90">{item.tagline}</p>

      {item.enables.length > 0 && (
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
            {item.kind === "link" ? "Linking lets Nomi" : "What you get"}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {item.enables.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.never.length > 0 && (
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Nomi will never</p>
          <ul className="mt-2 space-y-1.5 text-sm text-muted">
            {item.never.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto space-y-3 border-t border-border pt-4">
        {item.account && (
          <p className="text-sm">
            <span className="text-muted">Account: </span>
            <span className="font-medium">{item.account.label}</span>
            {when && <span className="text-muted"> · linked {when}</span>}
          </p>
        )}
        {item.detail && <p className="text-sm text-muted">{item.detail}</p>}

        <div className="flex flex-wrap items-center gap-2">
          {item.connectPath && (
            <a href={item.connectPath} className={buttonClasses("primary", "sm")}>
              {item.status === "error" ? `Connect ${item.name} again` : `Connect ${item.name}`}
            </a>
          )}
          {item.unlinkPath && <UnlinkButton path={item.unlinkPath} name={item.name} />}
          {item.externalUrl && (
            <ButtonLink href={item.externalUrl} variant="secondary" size="sm" external>
              Open {item.name}
            </ButtonLink>
          )}
          {item.status === "unavailable" && <span className="text-sm text-muted">Nothing to do on your side yet.</span>}
          {(item.status === "included" || item.status === "not_ready") && (
            <span className="text-sm text-muted">Nothing to set up on your side.</span>
          )}
        </div>
      </div>
    </li>
  );
}
