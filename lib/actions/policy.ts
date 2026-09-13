import { createHash } from "node:crypto";
import type { ActionStatus, UUID } from "@/types/contracts";

/**
 * Approval policy and action state machine. This is server policy, separate
 * from model instructions and separate from OAuth consent.
 *
 * Level 0: automatic, bounded.  Level 1: confirm local state change in UI.
 * Level 2: explicit approval of the exact payload.  Level 3: user completes in provider UI.
 */
export const POLICY = {
  "memory.read": 0,
  "products.search": 0,
  "options.compare": 0,
  "memory.capture_explicit": 0,
  "memory.edit": 1,
  "calendar.draft": 1,
  "memory.delete": 2,
  "calendar.create": 2,
  "email.send": 2,
  "reservation.create": 2,
  "checkout.complete": 3,
  "payment.authorize": 3,
} as const;

export type OperationKind = keyof typeof POLICY;
export type ApprovalLevel = (typeof POLICY)[OperationKind];

/** Only these operations have a handler in this build. Everything else is Unsupported. */
export const IMPLEMENTED: ReadonlySet<OperationKind> = new Set<OperationKind>([
  "memory.read",
  "products.search",
  "options.compare",
  "memory.capture_explicit",
  "memory.edit",
  "calendar.draft",
  "memory.delete",
  "calendar.create",
]);

export class UnsupportedOperationError extends Error {
  readonly kind: string;
  constructor(kind: string) {
    super(`unsupported_operation:${kind}`);
    this.name = "UnsupportedOperationError";
    this.kind = kind;
  }
}

export function isOperationKind(value: string): value is OperationKind {
  return Object.prototype.hasOwnProperty.call(POLICY, value);
}

export function approvalLevel(kind: string): ApprovalLevel {
  if (!isOperationKind(kind) || !IMPLEMENTED.has(kind)) throw new UnsupportedOperationError(kind);
  return POLICY[kind];
}

export type Disposition =
  | { type: "run" }
  | { type: "confirm_local" }
  | { type: "propose" }
  | { type: "user_must_complete_externally" };

/** What the dispatcher must do for an operation, given whether the UI supplied an explicit confirmation. */
export function dispositionFor(kind: string, hasExplicitUiConfirmation: boolean): Disposition {
  const level = approvalLevel(kind);
  if (level === 3) return { type: "user_must_complete_externally" };
  if (level === 2) return { type: "propose" };
  if (level === 1 && !hasExplicitUiConfirmation) return { type: "confirm_local" };
  return { type: "run" };
}

// ── State machine ───────────────────────────────────────────────────────────

export const ACTION_TRANSITIONS: Readonly<Record<ActionStatus, readonly ActionStatus[]>> = {
  proposed: ["executing", "cancelled", "expired"],
  executing: ["succeeded", "failed", "unknown"],
  unknown: ["succeeded", "failed"], // resolved only by reconciliation against the provider ID
  succeeded: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export function canTransition(from: ActionStatus, to: ActionStatus): boolean {
  return ACTION_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: ActionStatus): boolean {
  return ACTION_TRANSITIONS[status].length === 0;
}

/** Statuses from which a PATCH (Change) is allowed. */
export function isEditable(status: ActionStatus): boolean {
  return status === "proposed";
}

// ── Proposal integrity ──────────────────────────────────────────────────────

export const PROPOSAL_TTL_MS = 10 * 60 * 1000;

/** Google Calendar event IDs: base32hex, 5–1024 chars. A UUID without hyphens is 32 hex chars, a subset. */
export const PROVIDER_EVENT_ID_PATTERN = /^[0-9a-v]{5,1024}$/;

export function providerEventIdFor(actionId: UUID): string {
  const id = actionId.replace(/-/g, "").toLowerCase();
  if (!PROVIDER_EVENT_ID_PATTERN.test(id) || id.length !== 32) throw new Error("invalid_action_id");
  return id;
}

export function proposalKey(sourceTurnId: UUID, intentKind: string): string {
  return `${sourceTurnId}:${intentKind}`;
}

/** Stable JSON: sorted keys, no whitespace, so equal payloads hash equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function payloadHash(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export interface ProposalState {
  status: ActionStatus;
  version: number;
  expiresAt: string; // ISO
}

export type ProposalCheck =
  | { ok: true }
  | { ok: false; code: "stale_proposal" | "expired_proposal" | "already_processing" | "not_proposed" };

/** Preconditions for Allow / Change / Cancel on the CURRENT version. Pure; the DB claim is still authoritative. */
export function checkProposal(action: ProposalState, requestedVersion: number, now: Date): ProposalCheck {
  if (action.status === "executing") return { ok: false, code: "already_processing" };
  if (action.status !== "proposed") return { ok: false, code: "not_proposed" };
  if (action.version !== requestedVersion) return { ok: false, code: "stale_proposal" };
  if (Date.parse(action.expiresAt) <= now.getTime()) return { ok: false, code: "expired_proposal" };
  return { ok: true };
}
