"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ActionView, AssistantRequest, AssistantResponse, SuggestedAction } from "@/types/contracts";
import { ChangeProposalForm } from "@/components/assistant/change-proposal";
import { Composer, type ComposerHandle } from "@/components/assistant/composer";
import { MemoryDrawer } from "@/components/assistant/memory-drawer";
import { initialState, overlayAction, reduce, type Entry } from "@/components/assistant/reducer";
import { BlockRenderer } from "@/components/generative-ui/renderer";
import { Button } from "@/components/ui/button";
import { api, ClientApiError } from "@/lib/api-client";

const CONVERSATION_KEY = "nomi.conversationId";

function readConversationId(): string {
  try {
    const stored = window.localStorage.getItem(CONVERSATION_KEY);
    if (stored && /^[0-9a-f-]{36}$/.test(stored)) return stored;
  } catch {
    // storage unavailable; fall through
  }
  const fresh = crypto.randomUUID();
  try {
    window.localStorage.setItem(CONVERSATION_KEY, fresh);
  } catch {
    // ignore
  }
  return fresh;
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const EXAMPLES = [
  "I'm out of tomatoes and potatoes. I'm cooking chicken curry tonight. I'm looking for running shoes.",
  "What should I buy today?",
  "I bought potatoes.",
];

/**
 * The conversation: one column, one reducer. Every message is a real turn on
 * the server; every card comes back validated; every chip has a handler.
 */
export function Conversation({ voiceEnabled }: { voiceEnabled: boolean }) {
  const [state, dispatch] = useReducer(reduce, "", () => initialState(""));
  const composer = useRef<ComposerHandle>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const timeZone = useRef("UTC");
  const bottom = useRef<HTMLDivElement>(null);

  const refreshMemories = useCallback(async () => {
    try {
      dispatch({ type: "memories_loaded", memories: await api.memories() });
    } catch {
      // The drawer shows whatever it last had; a failed refresh is not an error state for the conversation.
    }
  }, []);

  useEffect(() => {
    timeZone.current = browserTimeZone();
    const conversationId = readConversationId();
    dispatch({ type: "new_conversation", conversationId });
    api
      .turns(conversationId)
      .then((turns) => dispatch({ type: "history_loaded", turns }))
      .catch(() => dispatch({ type: "history_failed" }));
    void refreshMemories();
  }, [refreshMemories]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [state.entries.length, state.pending]);

  async function run(request: AssistantRequest, label: string) {
    dispatch({ type: "send", request, label });
    try {
      const response: AssistantResponse = await api.assistant(request);
      dispatch({ type: "received", response });
      if (response.memory_updates.length > 0) void refreshMemories();
    } catch (e) {
      if (e instanceof ClientApiError) dispatch({ type: "failed", message: e.message, retryable: e.retryable });
      else dispatch({ type: "failed", message: "Something went wrong. Nothing was changed.", retryable: true });
    }
  }

  function sendText(text: string, inputKind: "text" | "voice") {
    void run({ clientRequestId: crypto.randomUUID(), conversationId: state.conversationId, text, inputKind, timeZone: timeZone.current }, text);
  }

  function sendSuggestion(sourceTurnId: string, action: SuggestedAction) {
    void run(
      { clientRequestId: crypto.randomUUID(), conversationId: state.conversationId, sourceTurnId, suggestionId: action.id, timeZone: timeZone.current },
      action.label,
    );
  }

  function retry(entry: Entry & { kind: "error" }) {
    if (!entry.request) return;
    dispatch({ type: "dismiss_error", id: entry.id });
    const label = state.entries.findLast((e) => e.kind === "user")?.text ?? "Retry";
    // Same clientRequestId: the server returns the stored answer if the first attempt actually finished.
    void run(entry.request, label);
  }

  async function actOn(id: string, work: () => Promise<ActionView>) {
    dispatch({ type: "action_busy", id });
    try {
      dispatch({ type: "action_updated", action: await work() });
    } catch (e) {
      dispatch({ type: "action_busy", id: null });
      if (e instanceof ClientApiError && (e.code === "stale_proposal" || e.code === "expired_proposal" || e.code === "already_processing" || e.code === "not_found")) {
        try {
          dispatch({ type: "action_updated", action: await api.action(id) });
        } catch {
          // leave the card as it was; the message below explains
        }
      }
      dispatch({ type: "failed", message: e instanceof ClientApiError ? e.message : "The action could not be completed.", retryable: false });
    }
  }

  function newConversation() {
    const fresh = crypto.randomUUID();
    try {
      window.localStorage.setItem(CONVERSATION_KEY, fresh);
    } catch {
      // ignore
    }
    dispatch({ type: "new_conversation", conversationId: fresh });
  }

  const empty = state.historyLoaded && state.entries.length === 0 && !state.pending;

  return (
    <div className="mx-auto flex w-full max-w-[800px] flex-1 flex-col px-4 sm:px-6">
      <div className="flex items-center justify-between gap-2 py-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          Conversation · {state.memories.length} {state.memories.length === 1 ? "memory" : "memories"}
        </p>
        <div className="flex gap-2">
          <Button variant="quiet" size="sm" onClick={newConversation} disabled={state.pending !== null}>
            New conversation
          </Button>
          <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "toggle_drawer", open: true })}>
            Memory
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-5 pb-6">
        {!state.historyLoaded && <p className="py-10 text-center text-sm text-muted">Loading your conversation…</p>}
        {empty && (
          <section className="rounded-card border border-border bg-surface p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Start here</p>
            <h2 className="mt-2 font-display text-2xl leading-tight">Tell Nomi something true about today.</h2>
            <p className="mt-2 text-sm text-muted">
              Facts you state are saved as editable memories. Questions are answered, not saved. Nothing happens in another app without your approval.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button
                    type="button"
                    onClick={() => composer.current?.insert(ex, "text")}
                    className="rounded-full border border-border bg-canvas px-3 py-1.5 text-left text-sm text-muted transition-colors hover:text-text"
                  >
                    {ex}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {state.entries.map((entry) => {
          if (entry.kind === "user") {
            return (
              <div key={entry.id} className="flex justify-end">
                <p className={`max-w-[85%] rounded-card px-4 py-2.5 text-[15px] ${entry.suggestion ? "border border-border bg-surface-2 text-muted" : "bg-text text-canvas"}`}>
                  {entry.suggestion ? `→ ${entry.text}` : entry.text}
                </p>
              </div>
            );
          }
          if (entry.kind === "error") {
            return (
              <div key={entry.id} role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                <span>{entry.message}</span>
                <span className="flex gap-2">
                  {entry.retryable && entry.request && (
                    <Button variant="secondary" size="sm" onClick={() => retry(entry as Entry & { kind: "error" })}>
                      Retry
                    </Button>
                  )}
                  <Button variant="quiet" size="sm" onClick={() => dispatch({ type: "dismiss_error", id: entry.id })}>
                    Dismiss
                  </Button>
                </span>
              </div>
            );
          }
          const r = entry.response;
          return (
            <div key={entry.id} className="space-y-3">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{r.message}</p>
              {r.ui.map((rawBlock, i) => {
                const block = overlayAction(rawBlock, state.actions);
                const actionId = block.type === "approval_card" ? block.data.actionId : null;
                const cardVersion = block.type === "approval_card" ? block.data.version : 0;
                const live = actionId ? state.actions[actionId] : undefined;
                const version = live?.version ?? cardVersion;
                const decision = r.ui.find((b) => b.type === "decision_card");
                return (
                  <div key={`${entry.id}_${i}`} className="space-y-2">
                    <BlockRenderer
                      block={block}
                      context={{
                        recommendedProductId: decision?.type === "decision_card" ? decision.data.recommendedProductId : null,
                        approval: actionId
                          ? {
                              busy: state.busyActionId === actionId,
                              onAllow: () => actOn(actionId, () => api.approveAction(actionId, version)),
                              onCancel: () => actOn(actionId, () => api.cancelAction(actionId, version)),
                              onChange: () => (live ? setChanging(actionId) : actOn(actionId, () => api.action(actionId)).then(() => setChanging(actionId))),
                              onCheckStatus: () => actOn(actionId, () => api.action(actionId)),
                            }
                          : undefined,
                      }}
                    />
                    {actionId && changing === actionId && live && <ChangeProposalForm action={live} onUpdated={(a) => dispatch({ type: "action_updated", action: a })} onClose={() => setChanging(null)} />}
                  </div>
                );
              })}
              {r.suggested_actions.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Suggested next steps">
                  {r.suggested_actions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        disabled={state.pending !== null}
                        onClick={() => (s.intent.kind === "open_memory" ? dispatch({ type: "toggle_drawer", open: true }) : sendSuggestion(r.turnId, s))}
                        className="rounded-full border border-accent/40 bg-accent-soft px-3 py-1.5 text-sm text-accent transition-colors hover:brightness-95 disabled:opacity-50"
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {state.pending && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            Working on your request…
          </p>
        )}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-0 bg-canvas pb-4 pt-2">
        <Composer ref={composer} disabled={state.pending !== null} voiceEnabled={voiceEnabled} onSend={sendText} />
      </div>

      <MemoryDrawer
        open={state.drawerOpen}
        memories={state.memories}
        onClose={() => dispatch({ type: "toggle_drawer", open: false })}
        onRemoved={(id) => dispatch({ type: "memory_removed", id })}
        onUpdated={(memory) => dispatch({ type: "memory_updated", memory })}
      />
    </div>
  );
}
