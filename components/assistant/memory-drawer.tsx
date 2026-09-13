"use client";

import { useState } from "react";
import type { Category, MemoryRecord } from "@/types/contracts";
import { Button } from "@/components/ui/button";
import { CategoryTag } from "@/components/ui/category-tag";
import { api, ClientApiError } from "@/lib/api-client";
import { formatLocalDate } from "@/lib/format";

const ORDER: Category[] = ["inventory", "plan", "task", "shopping_interest", "preference"];
const TITLE: Record<Category, string> = {
  inventory: "Running low or out",
  plan: "Plans",
  task: "To do",
  shopping_interest: "Considering",
  preference: "Preferences",
};

function MemoryRow({
  memory,
  onRemoved,
  onUpdated,
}: {
  memory: MemoryRecord;
  onRemoved: (id: string) => void;
  onUpdated: (memory: MemoryRecord) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Could not update this memory. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-control border border-border bg-surface p-3">
      <p className="text-sm font-medium">{memory.summary}</p>
      <p className="mt-1 text-xs text-muted">
        “{memory.sourceQuote}”{memory.expiresAt ? ` · until ${formatLocalDate(memory.expiresAt)}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!confirming ? (
          <>
            {(memory.category === "task" || memory.category === "inventory") && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(async () => onUpdated(await api.completeMemory(memory.id, memory.version)))}>
                {memory.category === "inventory" ? "Restocked" : "Done"}
              </Button>
            )}
            <Button variant="quiet" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </>
        ) : (
          <>
            <span className="text-xs text-muted">Delete “{memory.entity}”?</span>
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api.deleteMemory(memory.id, memory.version);
                  onRemoved(memory.id);
                })
              }
            >
              {busy ? "Deleting…" : "Yes, delete"}
            </Button>
            <Button variant="quiet" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

/** Side sheet over the conversation. Server rows only; edits go through the API and re-render from its reply. */
export function MemoryDrawer({
  open,
  memories,
  onClose,
  onRemoved,
  onUpdated,
}: {
  open: boolean;
  memories: MemoryRecord[];
  onClose: () => void;
  onRemoved: (id: string) => void;
  onUpdated: (memory: MemoryRecord) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Memory">
      <button type="button" aria-label="Close memory panel" className="flex-1 bg-text/20" onClick={onClose} />
      <aside className="flex h-full w-full max-w-[420px] flex-col border-l border-border bg-canvas shadow-lift">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Memory</p>
            <h2 className="font-display text-xl">What Nomi remembers</h2>
          </div>
          <Button variant="quiet" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {memories.length === 0 ? (
            <p className="text-sm text-muted">Nothing saved yet. Tell Nomi what ran out or what you are planning, and it appears here.</p>
          ) : (
            ORDER.filter((c) => memories.some((m) => m.category === c)).map((category) => (
              <section key={category} className="mb-6">
                <div className="mb-2 flex items-center gap-2">
                  <CategoryTag category={category} />
                  <h3 className="text-sm font-medium">{TITLE[category]}</h3>
                </div>
                <ul className="space-y-2">
                  {memories
                    .filter((m) => m.category === category)
                    .map((m) => (
                      <MemoryRow key={m.id} memory={m} onRemoved={onRemoved} onUpdated={onUpdated} />
                    ))}
                </ul>
              </section>
            ))
          )}
        </div>
        <p className="border-t border-border px-5 py-3 text-xs text-muted">
          Only things you said explicitly are saved. Deleting a memory removes it from every future answer.
        </p>
      </aside>
    </div>
  );
}
