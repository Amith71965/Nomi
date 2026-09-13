import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/errors";
import { assertSameOrigin, json, newRequestId, noContent, readJson, readQuery, route } from "@/lib/http";

const ORIGIN = "http://localhost:3000";

describe("json helpers", () => {
  it("always sets no-store and echoes the request id", async () => {
    const res = json({ a: 1 }, { requestId: "req_x" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toBe("req_x");
    expect(await res.json()).toEqual({ a: 1 });
    expect(noContent("req_y").status).toBe(204);
  });

  it("request ids are unique and prefixed", () => {
    const a = newRequestId();
    expect(a).toMatch(/^req_[0-9a-f]{20}$/);
    expect(newRequestId()).not.toBe(a);
  });
});

describe("assertSameOrigin", () => {
  it("ignores GET", () => {
    expect(() => assertSameOrigin(new Request("http://x/api", { method: "GET", headers: { origin: "http://evil" } }), ORIGIN)).not.toThrow();
  });

  it("accepts a matching Origin and rejects a different one on POST/PATCH/DELETE", () => {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      expect(() => assertSameOrigin(new Request("http://x/api", { method, headers: { origin: ORIGIN } }), ORIGIN)).not.toThrow();
      expect(() => assertSameOrigin(new Request("http://x/api", { method, headers: { origin: "http://evil.example" } }), ORIGIN)).toThrow(
        ApiError,
      );
    }
  });

  it("allows non-browser clients that send no Origin, but rejects cross-site Sec-Fetch-Site", () => {
    expect(() => assertSameOrigin(new Request("http://x/api", { method: "POST" }), ORIGIN)).not.toThrow();
    expect(() =>
      assertSameOrigin(new Request("http://x/api", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }), ORIGIN),
    ).toThrow(/Cross-site/);
  });
});

describe("readJson / readQuery", () => {
  const schema = z.strictObject({ version: z.int().positive() });

  it("rejects invalid JSON and schema failures as malformed_input with issue paths", async () => {
    const bad = new Request("http://x/api", { method: "POST", body: "{nope" });
    await expect(readJson(bad, schema)).rejects.toMatchObject({ code: "malformed_input" });
    const wrong = new Request("http://x/api", { method: "POST", body: JSON.stringify({ version: -1 }) });
    await expect(readJson(wrong, schema)).rejects.toMatchObject({
      code: "malformed_input",
      details: { issues: [{ path: "version" }] },
    });
  });

  it("parses query params using the first value of each key", () => {
    const req = new Request("http://x/api?category=inventory&category=plan");
    expect(readQuery(req, z.object({ category: z.string() }))).toEqual({ category: "inventory" });
  });
});

describe("route wrapper", () => {
  it("converts ApiError to the shared body with matching status", async () => {
    const handler = route(async () => {
      throw new ApiError("not_found", "nope");
    });
    const res = await handler(new Request("http://x/api/things/1"), undefined);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.error).toEqual({ code: "not_found", message: "nope", retryable: false });
    expect(body.requestId).toMatch(/^req_/);
  });

  it("hides unknown errors behind internal_error", async () => {
    const handler = route(async () => {
      throw new Error("secret stack details");
    });
    const res = await handler(new Request("http://x/api"), undefined);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("secret stack details");
  });
});
