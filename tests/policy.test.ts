import { describe, expect, it } from "vitest";
import {
  ACTION_TRANSITIONS,
  IMPLEMENTED,
  POLICY,
  PROPOSAL_TTL_MS,
  PROVIDER_EVENT_ID_PATTERN,
  UnsupportedOperationError,
  approvalLevel,
  canTransition,
  canonicalJson,
  checkProposal,
  dispositionFor,
  isEditable,
  isTerminal,
  payloadHash,
  proposalKey,
  providerEventIdFor,
} from "@/lib/actions/policy";

describe("approval policy", () => {
  it("assigns the documented levels", () => {
    expect(POLICY["memory.read"]).toBe(0);
    expect(POLICY["memory.edit"]).toBe(1);
    expect(POLICY["memory.delete"]).toBe(2);
    expect(POLICY["calendar.create"]).toBe(2);
    expect(POLICY["payment.authorize"]).toBe(3);
  });

  it("rejects unknown and unimplemented operations", () => {
    expect(() => approvalLevel("teleport.user")).toThrow(UnsupportedOperationError);
    expect(() => approvalLevel("email.send")).toThrow(UnsupportedOperationError); // defined but not implemented
    expect(IMPLEMENTED.has("email.send")).toBe(false);
    expect(() => approvalLevel("calendar.create")).not.toThrow();
  });

  it("level 2 is always a proposal, never a run", () => {
    expect(dispositionFor("calendar.create", true)).toEqual({ type: "propose" });
    expect(dispositionFor("memory.delete", true)).toEqual({ type: "propose" });
  });

  it("level 1 runs only with explicit UI confirmation", () => {
    expect(dispositionFor("memory.edit", false)).toEqual({ type: "confirm_local" });
    expect(dispositionFor("memory.edit", true)).toEqual({ type: "run" });
  });

  it("level 0 runs automatically", () => {
    expect(dispositionFor("products.search", false)).toEqual({ type: "run" });
    expect(dispositionFor("memory.capture_explicit", false)).toEqual({ type: "run" });
  });
});

describe("action state machine", () => {
  it("allows only the documented transitions", () => {
    expect(canTransition("proposed", "executing")).toBe(true);
    expect(canTransition("proposed", "cancelled")).toBe(true);
    expect(canTransition("proposed", "expired")).toBe(true);
    expect(canTransition("proposed", "succeeded")).toBe(false); // must go through executing
    expect(canTransition("executing", "succeeded")).toBe(true);
    expect(canTransition("executing", "unknown")).toBe(true);
    expect(canTransition("executing", "cancelled")).toBe(false); // cannot cancel mid-flight
    expect(canTransition("unknown", "succeeded")).toBe(true); // reconciliation
    expect(canTransition("succeeded", "proposed")).toBe(false);
    expect(canTransition("cancelled", "executing")).toBe(false);
    expect(canTransition("expired", "executing")).toBe(false);
  });

  it("terminal states have no exits; only proposed is editable", () => {
    for (const s of ["succeeded", "failed", "cancelled", "expired"] as const) {
      expect(isTerminal(s)).toBe(true);
      expect(ACTION_TRANSITIONS[s]).toEqual([]);
    }
    expect(isEditable("proposed")).toBe(true);
    expect(isEditable("executing")).toBe(false);
  });
});

describe("proposal integrity", () => {
  const actionId = "1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a";

  it("derives a stable provider event ID from the action UUID", () => {
    const id = providerEventIdFor(actionId);
    expect(id).toBe("1d2e3f4a5b6c4d7e8f9a0b1c2d3e4f5a");
    expect(id).toHaveLength(32);
    expect(PROVIDER_EVENT_ID_PATTERN.test(id)).toBe(true);
    expect(providerEventIdFor(actionId.toUpperCase())).toBe(id); // same every time
  });

  it("rejects non-UUID input", () => {
    expect(() => providerEventIdFor("not-a-uuid")).toThrow("invalid_action_id");
  });

  it("proposal key is deterministic for source turn + intent", () => {
    expect(proposalKey("t1", "schedule_grocery_run")).toBe("t1:schedule_grocery_run");
  });

  it("payload hash is order-independent and content-sensitive", () => {
    const a = { title: "x", start: "1", nested: { b: 2, a: 1 } };
    const b = { nested: { a: 1, b: 2 }, start: "1", title: "x" };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(payloadHash(a)).toBe(payloadHash(b));
    expect(payloadHash({ ...a, title: "y" })).not.toBe(payloadHash(a));
    expect(payloadHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("TTL is ten minutes", () => {
    expect(PROPOSAL_TTL_MS).toBe(600_000);
  });
});

describe("checkProposal", () => {
  const now = new Date("2026-09-11T14:05:00-04:00");
  const live = { status: "proposed" as const, version: 2, expiresAt: "2026-09-11T14:15:00-04:00" };

  it("accepts the current, unexpired version", () => {
    expect(checkProposal(live, 2, now)).toEqual({ ok: true });
  });

  it("rejects a stale Allow after a Change bumped the version", () => {
    expect(checkProposal(live, 1, now)).toEqual({ ok: false, code: "stale_proposal" });
  });

  it("rejects an expired proposal", () => {
    expect(checkProposal(live, 2, new Date("2026-09-11T14:15:00-04:00"))).toEqual({ ok: false, code: "expired_proposal" });
  });

  it("reports already_processing while executing and not_proposed for terminal states", () => {
    expect(checkProposal({ ...live, status: "executing" }, 2, now)).toEqual({ ok: false, code: "already_processing" });
    expect(checkProposal({ ...live, status: "cancelled" }, 2, now)).toEqual({ ok: false, code: "not_proposed" });
    expect(checkProposal({ ...live, status: "succeeded" }, 2, now)).toEqual({ ok: false, code: "not_proposed" });
  });
});
