"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { unlinkResultSchema } from "@/lib/schemas/connections";

/**
 * Two-step unlink: the first press asks for a named confirmation, the second
 * calls DELETE on the provider route. The server decides the outcome; the page
 * re-renders from the real row afterwards.
 */
export function UnlinkButton({ path, name }: { path: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "DELETE", credentials: "same-origin", headers: { accept: "application/json" } });
      if (res.status === 404) {
        router.replace("/app/connections");
        router.refresh();
        return;
      }
      if (!res.ok) {
        setError(res.status === 503 ? "Linking is not available on this deployment right now." : "Could not unlink. Try again.");
        return;
      }
      const parsed = unlinkResultSchema.safeParse(await res.json());
      if (!parsed.success) {
        setError("Unexpected reply from the server. Refresh to see the current state.");
        return;
      }
      router.replace(`/app/connections?unlinked=${parsed.data.provider}&provider_revoked=${parsed.data.providerRevoked ? "1" : "0"}`);
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        Unlink
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">Unlink {name}?</span>
      <Button variant="danger" size="sm" onClick={unlink} disabled={busy}>
        {busy ? "Unlinking…" : `Yes, unlink ${name}`}
      </Button>
      <Button variant="quiet" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
        Keep it
      </Button>
      {error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
