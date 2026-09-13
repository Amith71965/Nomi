"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, ClientApiError } from "@/lib/api-client";
import { LOCATION_MAX } from "@/lib/preferences";

const inputClass =
  "h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

/**
 * Where the user shops. This is their setting, not the deployment's: it is
 * stored as an ordinary memory they can see and delete. When a Maps key is
 * configured the typed text is resolved to a canonical city; when it is not,
 * their own words are kept and the card says so.
 */
export function ShoppingLocationCard({ initial }: { initial: string | null }) {
  const [saved, setSaved] = useState<string | null>(initial);
  const [text, setText] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const result = await api.setShoppingLocation(text.trim());
      setSaved(result.location);
      setText(result.location);
      setNote(
        result.verified
          ? "Recognised and saved. Product searches will use this area."
          : "Saved as you typed it. It was not recognised as a place, so results may not be local.",
      );
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Could not save your location. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      await api.clearShoppingLocation();
      setSaved(null);
      setText("");
      setNote("Cleared. Searches will not be localized until you set one.");
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Could not clear your location. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">You choose this</p>
          <h3 className="mt-1 font-display text-xl">Where you shop</h3>
        </div>
        <Badge tone={saved ? "success" : "neutral"}>{saved ? "Set" : "Not set"}</Badge>
      </div>

      <p className="mt-3 text-sm text-text/90">
        Nomi searches grocery listings near this place. Nothing is looked up until you ask for it, and you can change or remove
        this at any time.
      </p>

      <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="mb-1 block text-muted">City or area</span>
          <input
            className={inputClass}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={LOCATION_MAX}
            placeholder="Austin, Texas"
            aria-label="City or area where you shop"
          />
        </label>
        <Button type="submit" size="sm" disabled={busy || text.trim().length < 2}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {saved && (
          <Button type="button" variant="quiet" size="sm" onClick={clear} disabled={busy}>
            Clear
          </Button>
        )}
      </form>

      {saved && <p className="mt-3 text-sm">Searching near <span className="font-medium">{saved}</span>.</p>}
      {note && (
        <p role="status" className="mt-2 text-sm text-muted">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <p className="mt-3 font-mono text-[11px] text-muted">Stored as a memory you can delete. Nomi never guesses your location.</p>
    </section>
  );
}
