import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVERSATION, USER_A, USER_B, makeMemoryRow, memoryStore } from "../helpers/fake-stores";

const auth = vi.hoisted(() => ({ current: null as null | { userId: string; email: string | null; isDemoUser: boolean } }));

vi.mock("@/lib/auth", async () => {
  const { ApiError } = await import("@/lib/errors");
  return {
    requireUser: async () => {
      if (!auth.current) throw new ApiError("unauthenticated", "Sign in to continue.");
      return auth.current;
    },
    requireDemoUser: () => undefined,
  };
});

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ APP_ORIGIN: "http://localhost:3000" }),
}));

vi.mock("@/lib/memory/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/memory/service")>();
  const { memoryStore } = await import("../helpers/fake-stores");
  return { ...actual, memoryServiceFromEnv: () => new actual.MemoryService(memoryStore) };
});

import { GET } from "@/app/api/memories/route";
import { DELETE, PATCH } from "@/app/api/memories/[id]/route";

const ID_A = "00000000-0000-4000-8000-00000000000a";
const ID_B = "00000000-0000-4000-8000-00000000000b";
const ORIGIN = "http://localhost:3000";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("memory routes", () => {
  beforeEach(() => {
    memoryStore.reset();
    memoryStore.seed(makeMemoryRow({ id: ID_A, user_id: USER_A }));
    memoryStore.seed(makeMemoryRow({ id: ID_B, user_id: USER_B, entity_key: "onion", entity: "Onions" }));
    auth.current = { userId: USER_A, email: "a@example.com", isDemoUser: true };
    void CONVERSATION;
  });

  it("GET 401 without a session", async () => {
    auth.current = null;
    const res = await GET(req("GET", "/api/memories"), undefined);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthenticated");
  });

  it("GET returns only the caller's rows with no-store", async () => {
    const res = await GET(req("GET", "/api/memories"), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.memories.map((m: { id: string }) => m.id)).toEqual([ID_A]);
  });

  it("GET 400 on an unknown category filter", async () => {
    const res = await GET(req("GET", "/api/memories?category=secrets"), undefined);
    expect(res.status).toBe(400);
  });

  it("PATCH 403 on a cross-origin request before touching auth or data", async () => {
    const res = await PATCH(req("PATCH", `/api/memories/${ID_A}`, { version: 1, status: "completed" }, { origin: "http://evil.example" }), ctx(ID_A));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("origin_mismatch");
  });

  it("PATCH updates with the current version and returns the new record", async () => {
    const res = await PATCH(req("PATCH", `/api/memories/${ID_A}`, { version: 1, value: { availability: "available" } }), ctx(ID_A));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.memory.version).toBe(2);
    expect(body.memory.summary).toBe("Tomatoes available");
  });

  it("PATCH 409 version_conflict on a stale version", async () => {
    await PATCH(req("PATCH", `/api/memories/${ID_A}`, { version: 1, status: "completed" }), ctx(ID_A));
    const res = await PATCH(req("PATCH", `/api/memories/${ID_A}`, { version: 1, status: "active" }), ctx(ID_A));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("version_conflict");
  });

  it("PATCH 404 for another user's memory", async () => {
    const res = await PATCH(req("PATCH", `/api/memories/${ID_B}`, { version: 1, status: "completed" }), ctx(ID_B));
    expect(res.status).toBe(404);
  });

  it("PATCH 400 on a malformed id or body", async () => {
    expect((await PATCH(req("PATCH", "/api/memories/nope", { version: 1, status: "completed" }), ctx("nope"))).status).toBe(400);
    expect((await PATCH(req("PATCH", `/api/memories/${ID_A}`, { version: 1 }), ctx(ID_A))).status).toBe(400);
    expect((await PATCH(req("PATCH", `/api/memories/${ID_A}`, { version: 1, user_id: USER_B, status: "completed" }), ctx(ID_A))).status).toBe(400);
  });

  it("PATCH 409 turn_in_progress while the assistant is running", async () => {
    memoryStore.activeTurnUsers.add(USER_A);
    const res = await PATCH(req("PATCH", `/api/memories/${ID_A}`, { version: 1, status: "completed" }), ctx(ID_A));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("turn_in_progress");
  });

  it("DELETE requires confirmed:true", async () => {
    const res = await DELETE(req("DELETE", `/api/memories/${ID_A}`, { version: 1, confirmed: false }), ctx(ID_A));
    expect(res.status).toBe(400);
  });

  it("DELETE 204 removes the row and invalidates context; second delete is 404", async () => {
    const res = await DELETE(req("DELETE", `/api/memories/${ID_A}`, { version: 1, confirmed: true }), ctx(ID_A));
    expect(res.status).toBe(204);
    expect(memoryStore.invalidations.get(USER_A)).toBe(1);
    const again = await DELETE(req("DELETE", `/api/memories/${ID_A}`, { version: 1, confirmed: true }), ctx(ID_A));
    expect(again.status).toBe(404);
  });

  it("DELETE 404 for another user's memory and leaves it intact", async () => {
    const res = await DELETE(req("DELETE", `/api/memories/${ID_B}`, { version: 1, confirmed: true }), ctx(ID_B));
    expect(res.status).toBe(404);
    expect(await memoryStore.get(USER_B, ID_B)).not.toBeNull();
  });
});
