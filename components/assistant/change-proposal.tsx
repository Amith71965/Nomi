"use client";

import { useState, type FormEvent } from "react";
import type { ActionView } from "@/types/contracts";
import { Button } from "@/components/ui/button";
import { api, ClientApiError } from "@/lib/api-client";
import { addMinutes, toLocalParts, toRfc3339, zonedPartsToInstant } from "@/lib/time";

const inputClass =
  "h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Change the proposal before approving. Edits are sent as a PATCH with the
 * current version; the server bumps the version and the card re-renders from
 * its reply. Times are interpreted in the proposal's own time zone.
 */
export function ChangeProposalForm({ action, onUpdated, onClose }: { action: ActionView; onUpdated: (a: ActionView) => void; onClose: () => void }) {
  const start = new Date(action.preview.startAt);
  const end = new Date(action.preview.endAt);
  const parts = toLocalParts(start, action.preview.timeZone);
  const durationMinutes = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000));

  const [title, setTitle] = useState(action.preview.title);
  const [date, setDate] = useState(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}`);
  const [time, setTime] = useState(`${pad(parts.hour)}:${pad(parts.minute)}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    if (![y, m, d, hh, mm].every(Number.isFinite)) {
      setError("Enter a valid date and time.");
      return;
    }
    const resolved = zonedPartsToInstant({ year: y, month: m, day: d, hour: hh, minute: mm, second: 0 }, action.preview.timeZone);
    if (resolved.nonexistent || resolved.ambiguous) {
      setError("That time does not exist or is ambiguous in this time zone. Pick another.");
      return;
    }
    if (resolved.instant.getTime() <= Date.now()) {
      setError("That time is in the past. Pick a future time.");
      return;
    }
    setBusy(true);
    try {
      const updated = await api.patchAction(action.id, {
        version: action.version,
        title: title.trim(),
        startAt: toRfc3339(resolved.instant, action.preview.timeZone),
        endAt: toRfc3339(addMinutes(resolved.instant, durationMinutes), action.preview.timeZone),
      });
      onUpdated(updated);
      onClose();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Could not change the proposal. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-card border border-border bg-surface-2 p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Change proposal · v{action.version}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Title</span>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Date</span>
          <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Start ({action.preview.timeZone})</span>
          <input className={inputClass} type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">Duration stays {durationMinutes} minutes. Saving creates a new version; nothing is added to your calendar until you press Allow.</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={busy || title.trim().length === 0}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="quiet" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
