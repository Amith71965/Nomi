import { describe, expect, it } from "vitest";
import { ApiClient, ClientApiError } from "@/lib/api-client";

function fake(status: number, body: unknown, capture?: { url?: string; init?: RequestInit }) {
  return async (url: string, init?: RequestInit) => {
    if (capture) {
      capture.url = url;
      capture.init = init;
    }
    return new Response(body === null ? null : typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
}

describe("ApiClient", () => {
  it("validates successful responses and rejects unreadable ones", async () => {
    const good = new ApiClient({ fetchImpl: fake(200, { memories: [] }) });
    expect(await good.memories()).toEqual([]);
    const bad = new ApiClient({ fetchImpl: fake(200, { memories: [{ nope: true }] }) });
    await expect(bad.memories()).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("surfaces the server's error code, message, and retryability", async () => {
    const client = new ApiClient({ fetchImpl: fake(409, { error: { code: "turn_in_progress", message: "Still working.", retryable: true }, requestId: "req_1" }) });
    const err = await client.turns("11111111-1111-4111-8111-111111111111").catch((e) => e);
    expect(err).toBeInstanceOf(ClientApiError);
    expect(err).toMatchObject({ code: "turn_in_progress", message: "Still working.", retryable: true, status: 409, requestId: "req_1" });
  });

  it("sends same-origin JSON and treats 204 as success", async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const client = new ApiClient({ fetchImpl: fake(204, null, capture) });
    await client.deleteMemory("abc", 3);
    expect(capture.url).toBe("/api/memories/abc");
    expect(capture.init?.method).toBe("DELETE");
    expect(capture.init?.credentials).toBe("same-origin");
    expect(JSON.parse(String(capture.init?.body))).toEqual({ version: 3, confirmed: true });
  });

  it("maps a network failure to a retryable error", async () => {
    const client = new ApiClient({
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(client.connections()).rejects.toMatchObject({ code: "network", retryable: true });
  });
});
