import type { ActionView, AssistantRequest, AssistantResponse, MemoryRecord, TurnView, UIBlock } from "@/types/contracts";

/**
 * One reducer for the conversation. The server is authoritative for memory and
 * action state; this only mirrors what it returned. Pure, so it is unit-tested
 * without React.
 */

export type Entry =
  | { kind: "user"; id: string; text: string; suggestion: boolean }
  | { kind: "assistant"; id: string; response: AssistantResponse }
  | { kind: "error"; id: string; message: string; retryable: boolean; request: AssistantRequest | null };

export interface ConversationState {
  conversationId: string;
  entries: Entry[];
  /** The request in flight, kept so a retry reuses the same clientRequestId (idempotent). */
  pending: { request: AssistantRequest; label: string } | null;
  memories: MemoryRecord[];
  /** Latest server state per action, keyed by action id; overrides the stored approval card. */
  actions: Record<string, ActionView>;
  busyActionId: string | null;
  drawerOpen: boolean;
  historyLoaded: boolean;
}

export type Action =
  | { type: "history_loaded"; turns: TurnView[] }
  | { type: "history_failed" }
  | { type: "send"; request: AssistantRequest; label: string }
  | { type: "received"; response: AssistantResponse }
  | { type: "failed"; message: string; retryable: boolean }
  | { type: "dismiss_error"; id: string }
  | { type: "memories_loaded"; memories: MemoryRecord[] }
  | { type: "memory_removed"; id: string }
  | { type: "memory_updated"; memory: MemoryRecord }
  | { type: "action_busy"; id: string | null }
  | { type: "action_updated"; action: ActionView }
  | { type: "toggle_drawer"; open?: boolean }
  | { type: "new_conversation"; conversationId: string };

export function initialState(conversationId: string): ConversationState {
  return { conversationId, entries: [], pending: null, memories: [], actions: {}, busyActionId: null, drawerOpen: false, historyLoaded: false };
}

let seq = 0;
export function nextEntryId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

export function entriesFromTurns(turns: TurnView[]): Entry[] {
  const out: Entry[] = [];
  for (const t of turns) {
    out.push({ kind: "user", id: `u_${t.id}`, text: t.inputText.replace(/^\[suggestion\]\s*/, ""), suggestion: t.inputKind === "suggestion" });
    if (t.response) out.push({ kind: "assistant", id: `a_${t.id}`, response: t.response });
    else if (t.status === "failed") out.push({ kind: "error", id: `e_${t.id}`, message: failureText(t.errorCode), retryable: false, request: null });
  }
  return out;
}

export function failureText(code: string | null): string {
  switch (code) {
    case "deadline_exceeded":
      return "That took too long and was stopped. Nothing was changed.";
    case "provider_unavailable":
      return "The assistant is not available right now. Nothing was changed.";
    case "rate_limited":
      return "Too many requests in a minute. Wait a moment and try again.";
    case "stale_context":
      return "Your memories changed since that suggestion was made. Ask again for fresh suggestions.";
    default:
      return "That request did not complete. Nothing was changed.";
  }
}

export function reduce(state: ConversationState, action: Action): ConversationState {
  switch (action.type) {
    case "history_loaded":
      return { ...state, entries: entriesFromTurns(action.turns), historyLoaded: true };
    case "history_failed":
      return { ...state, historyLoaded: true };
    case "send": {
      if (state.pending) return state;
      const user: Entry = { kind: "user", id: nextEntryId("u"), text: action.label, suggestion: !("text" in action.request) };
      return { ...state, entries: [...state.entries, user], pending: { request: action.request, label: action.label } };
    }
    case "received":
      return { ...state, pending: null, entries: [...state.entries, { kind: "assistant", id: nextEntryId("a"), response: action.response }] };
    case "failed": {
      const request = state.pending?.request ?? null;
      return {
        ...state,
        pending: null,
        entries: [...state.entries, { kind: "error", id: nextEntryId("e"), message: action.message, retryable: action.retryable && request !== null, request }],
      };
    }
    case "dismiss_error":
      return { ...state, entries: state.entries.filter((e) => e.id !== action.id) };
    case "memories_loaded":
      return { ...state, memories: action.memories };
    case "memory_removed":
      return { ...state, memories: state.memories.filter((m) => m.id !== action.id) };
    case "memory_updated":
      return { ...state, memories: state.memories.map((m) => (m.id === action.memory.id ? action.memory : m)).filter((m) => m.status === "active") };
    case "action_busy":
      return { ...state, busyActionId: action.id };
    case "action_updated":
      return { ...state, busyActionId: null, actions: { ...state.actions, [action.action.id]: action.action } };
    case "toggle_drawer":
      return { ...state, drawerOpen: action.open ?? !state.drawerOpen };
    case "new_conversation":
      return { ...initialState(action.conversationId), memories: state.memories, historyLoaded: true };
  }
}

/**
 * Apply the latest server-known action state to a stored approval card. A
 * succeeded action becomes the live confirmation card; anything else keeps
 * the approval card with its real status. Nothing here invents success.
 */
export function overlayAction(block: UIBlock, actions: Record<string, ActionView>): UIBlock {
  if (block.type !== "approval_card") return block;
  const live = actions[block.data.actionId];
  if (!live) return block;
  if (live.status === "succeeded" && live.eventId && live.eventUrl && live.executedAt) {
    return {
      type: "calendar_confirmation",
      data: { actionId: live.id, eventId: live.eventId, eventUrl: live.eventUrl, event: live.preview, verifiedAt: live.executedAt, mode: "live" },
    };
  }
  const status = live.status === "succeeded" ? "unknown" : live.status;
  return { type: "approval_card", data: { ...block.data, version: live.version, status, expiresAt: live.expiresAt, preview: live.preview } };
}
