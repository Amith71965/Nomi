import { beforeEach, describe, expect, it, vi } from "vitest";
import fixtures from "@/fixtures/ui-responses.json";
import { CONVERSATION, USER_A, USER_B, makeTurnRow, turnStore } from "../helpers/fake-stores";

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

vi.mock("@/lib/turns/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/turns/service")>();
  const { turnStore } = await import("../helpers/fake-stores");
  return { ...actual, turnServiceFromEnv: () => new actual.TurnService(turnStore) };
});

import { GET } from "@/app/api/turns/route";

describe("GET /api/turns", () => {
  beforeEach(() => {
    turnStore.reset();
    auth.current = { userId: USER_A, email: null, isDemoUser: true };
  });

  it("401 without a session", async () => {
    auth.current = null;
    const res = await GET(new Request(`http://x/api/turns?conversationId=${CONVERSATION}`), undefined);
    expect(res.status).toBe(401);
  });

  it("400 without a valid conversationId", async () => {
    expect((await GET(new Request("http://x/api/turns"), undefined)).status).toBe(400);
    expect((await GET(new Request("http://x/api/turns?conversationId=abc"), undefined)).status).toBe(400);
  });

  it("returns the caller's turns oldest first, with valid stored responses parsed and invalid ones hidden", async () => {
    turnStore.seed(
      makeTurnRow({
        id: "00000000-0000-4000-8000-000000000101",
        user_id: USER_A,
        created_at: "2026-09-11T18:00:00+00:00",
        response: fixtures.responses.four_fact_turn,
      }),
    );
    turnStore.seed(
      makeTurnRow({
        id: "00000000-0000-4000-8000-000000000102",
        user_id: USER_A,
        created_at: "2026-09-11T18:05:00+00:00",
        response: { schemaVersion: "0", garbage: true },
      }),
    );
    turnStore.seed(makeTurnRow({ id: "00000000-0000-4000-8000-000000000103", user_id: USER_B }));

    const res = await GET(new Request(`http://x/api/turns?conversationId=${CONVERSATION}`), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { turns } = await res.json();
    expect(turns.map((t: { id: string }) => t.id)).toEqual([
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000102",
    ]);
    expect(turns[0].response.schemaVersion).toBe("1");
    expect(turns[1].response).toBeNull();
    expect(turns[1].errorCode).toBe("invalid_stored_response");
  });
});
