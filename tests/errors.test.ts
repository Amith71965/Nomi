import { describe, expect, it } from "vitest";
import { ApiError, ERROR_STATUS, errorBody, toApiError } from "@/lib/errors";

describe("ApiError", () => {
  it("maps every code to the documented status", () => {
    expect(ERROR_STATUS.malformed_input).toBe(400);
    expect(ERROR_STATUS.unauthenticated).toBe(401);
    expect(ERROR_STATUS.demo_restricted).toBe(403);
    expect(ERROR_STATUS.not_found).toBe(404);
    expect(ERROR_STATUS.stale_proposal).toBe(409);
    expect(ERROR_STATUS.expired_proposal).toBe(410);
    expect(ERROR_STATUS.rate_limited).toBe(429);
    expect(ERROR_STATUS.provider_error).toBe(502);
    expect(ERROR_STATUS.provider_unavailable).toBe(503);
  });

  it("derives status and default retryability from the code", () => {
    expect(new ApiError("stale_proposal", "x").status).toBe(409);
    expect(new ApiError("stale_proposal", "x").retryable).toBe(false);
    expect(new ApiError("provider_error", "x").retryable).toBe(true);
    expect(new ApiError("provider_error", "x", { retryable: false }).retryable).toBe(false);
  });

  it("serializes to the shared body shape without leaking details", () => {
    const err = new ApiError("not_found", "No such action.", { details: { secret: "nope" } });
    const body = errorBody(err, "req_123");
    expect(body).toEqual({
      error: { code: "not_found", message: "No such action.", retryable: false },
      requestId: "req_123",
    });
    expect(JSON.stringify(body)).not.toContain("nope");
  });

  it("wraps unknown throwables as internal_error and aborts as deadline_exceeded", () => {
    expect(toApiError(new Error("boom")).code).toBe("internal_error");
    expect(toApiError("string").code).toBe("internal_error");
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(toApiError(abort).code).toBe("deadline_exceeded");
    const passthrough = new ApiError("rate_limited", "slow down");
    expect(toApiError(passthrough)).toBe(passthrough);
  });
});
