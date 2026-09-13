import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVERSATION, USER_A, memoryStore, turnStore } from "../helpers/fake-stores";
import { FakeModel, answer } from "../helpers/fake-model";

const auth = vi.hoisted(() => ({ current: null as null | { userId: string; email: string | null; isDemoUser: boolean } }));
const script = vi.hoisted(() => ({ steps: [] as unknown[] }));

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
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getEnv: () => ({ APP_ORIGIN: "http://localhost:3000", ENABLE_VOICE: false, RESEARCH_MODE: "fixture" }) };
});
vi.mock("@/lib/ai/client", async () => {
  const { FakeModel } = await import("../helpers/fake-model");
  return { modelClientFromEnv: () => new FakeModel(script.steps as ConstructorParameters<typeof FakeModel>[0]) };
});
vi.mock("@/lib/memory/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/memory/service")>();
  const { memoryStore } = await import("../helpers/fake-stores");
  return { ...actual, memoryServiceFromEnv: () => new actual.MemoryService(memoryStore) };
});
vi.mock("@/lib/turns/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/turns/service")>();
  const { turnStore } = await import("../helpers/fake-stores");
  return { ...actual, turnStoreFromEnv: () => turnStore };
});

import { POST } from "@/app/api/assistant/route";

const ORIGIN = "http://localhost:3000";
function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/assistant`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}
const body = { clientRequestId: "77777777-7777-4777-8777-777777777777", conversationId: CONVERSATION, text: "hello", inputKind: "text", timeZone: "America/New_York" };

describe("POST /api/assistant", () => {
  beforeEach(() => {
    memoryStore.reset();
    turnStore.reset();
    script.steps = [answer({ message: "hi there" })];
    auth.current = { userId: USER_A, email: null, isDemoUser: true };
    void FakeModel;
  });

  it("401 without a session", async () => {
    auth.current = null;
    expect((await POST(req(body), undefined)).status).toBe(401);
  });

  it("403 on a cross-origin request", async () => {
    const res = await POST(req(body, { origin: "http://evil.example" }), undefined);
    expect(res.status).toBe(403);
  });

  it("400 on malformed input, including both input forms at once and a client-supplied user id", async () => {
    expect((await POST(req({ ...body, text: "" }), undefined)).status).toBe(400);
    expect((await POST(req({ ...body, sourceTurnId: CONVERSATION, suggestionId: CONVERSATION }), undefined)).status).toBe(400);
    expect((await POST(req({ ...body, userId: USER_A }), undefined)).status).toBe(400);
  });

  it("200 with a validated AssistantResponse and no-store", async () => {
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = await res.json();
    expect(json.schemaVersion).toBe("1");
    expect(json.message).toBe("hi there");
    expect(turnStore.all()[0]?.status).toBe("completed");
  });

  it("409 turn_in_progress while another turn is processing", async () => {
    await turnStore.begin(USER_A, { conversationId: CONVERSATION, clientRequestId: "88888888-8888-4888-8888-888888888888", inputText: "busy", inputKind: "text" });
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("turn_in_progress");
  });
});
