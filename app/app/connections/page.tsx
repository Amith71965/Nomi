import type { Metadata } from "next";
import Link from "next/link";
import type { ConnectionsView, IntegrationView } from "@/types/contracts";
import { first, linkNotice } from "@/components/connections/copy";
import { IntegrationCard } from "@/components/connections/integration-card";
import { buttonClasses } from "@/components/ui/button";
import { connectionsServiceFromEnv } from "@/lib/connections/service";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Linked apps" };
export const dynamic = "force-dynamic";

const NOTICE_CLASS = {
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  neutral: "border-border bg-surface-2 text-text",
} as const;

function split(view: ConnectionsView): { primary: IntegrationView[]; rest: IntegrationView[] } {
  const primary = view.integrations.filter((i) => i.kind === "link" || i.kind === "included");
  const rest = view.integrations.filter((i) => i.kind !== "link" && i.kind !== "included");
  return { primary, rest };
}

/**
 * Onboarding and settings in one place: every integration as a card with what
 * linking enables, its real status, and the only actions that apply. New
 * accounts arrive here with `?welcome=1`.
 */
export default async function ConnectionsPage({ searchParams }: PageProps<"/app/connections">) {
  const params = await searchParams;
  const welcome = first(params.welcome) === "1";
  const notice = linkNotice({
    linked: first(params.linked),
    link_error: first(params.link_error),
    unlinked: first(params.unlinked),
    provider_revoked: first(params.provider_revoked),
  });

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let view: ConnectionsView | null = null;
  if (user) {
    try {
      view = await connectionsServiceFromEnv().view(user.id);
    } catch {
      view = null;
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 py-12 sm:px-8">
      <header className="max-w-[64ch]">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">{welcome ? "Welcome" : "Linked apps"}</p>
        <h1 className="mt-3 font-display text-[34px] leading-[1.08] sm:text-[40px]">
          {welcome ? "Choose what Nomi may work with." : "Your apps, on your terms."}
        </h1>
        <p className="mt-4 text-muted">
          Each card says what linking lets Nomi do and what it will never do. Nothing is connected until you press Connect, and
          you can unlink at any time. Things marked Included need no setup from you.
        </p>
      </header>

      {notice && (
        <p role="status" className={`mt-8 rounded-control border px-4 py-3 text-sm ${NOTICE_CLASS[notice.tone]}`}>
          {notice.text}
        </p>
      )}

      {view === null ? (
        <section className="mt-10 rounded-card border border-danger/30 bg-danger-soft p-6">
          <p className="text-sm text-danger">Could not load your linked apps right now.</p>
          <Link href="/app/connections" className={`mt-4 ${buttonClasses("secondary", "sm")}`}>
            Try again
          </Link>
        </section>
      ) : (
        <>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {split(view).primary.map((item) => (
              <IntegrationCard key={item.key} item={item} />
            ))}
          </ul>
          <section className="mt-14">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">Also</p>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {split(view).rest.map((item) => (
                <IntegrationCard key={item.key} item={item} />
              ))}
            </ul>
          </section>
          <p className="mt-10 font-mono text-[11px] text-muted">
            Status checked {new Date(view.checkedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. Statuses come
            from your own account data and this deployment&apos;s configuration, never from assumptions.
          </p>
          {welcome && (
            <div className="mt-8">
              <Link href="/app" className={buttonClasses("secondary", "md")}>
                Continue to the assistant
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
