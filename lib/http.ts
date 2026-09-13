import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { ApiError, errorBody, toApiError } from "@/lib/errors";

/** Request-scoped ID returned in every response body and `X-Request-Id`. */
export function newRequestId(): string {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export interface JsonInit {
  requestId: string;
  status?: number;
  headers?: Record<string, string>;
}

/** JSON response with `Cache-Control: no-store`; authenticated data is never cacheable. */
export function json(data: unknown, init: JsonInit): Response {
  return Response.json(data, {
    status: init.status ?? 200,
    headers: { "Cache-Control": "no-store", "X-Request-Id": init.requestId, ...init.headers },
  });
}

export function noContent(requestId: string): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

export function jsonError(error: ApiError, requestId: string): Response {
  return json(errorBody(error, requestId), { requestId, status: error.status });
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Same-origin check for state-changing requests. A browser always sends
 * `Origin` on these methods; a mismatch is rejected. Non-browser clients
 * (Postman, scripts) omit it and rely on bearer auth instead.
 */
export function assertSameOrigin(request: Request, appOrigin: string): void {
  if (!MUTATING.has(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  if (origin !== null) {
    if (origin !== appOrigin) throw new ApiError("origin_mismatch", "Cross-origin requests are not allowed.");
    return;
  }
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") {
    throw new ApiError("origin_mismatch", "Cross-site requests are not allowed.");
  }
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("malformed_input", "Request body must be valid JSON.");
  }
  return parseWith(schema, raw, "Request body failed validation.");
}

export function readQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const params = new URL(request.url).searchParams;
  const raw: Record<string, string> = {};
  for (const [key, value] of params) if (!(key in raw)) raw[key] = value;
  return parseWith(schema, raw, "Query parameters failed validation.");
}

export function readParam<T>(value: unknown, schema: z.ZodType<T>): T {
  return parseWith(schema, value, "Route parameter failed validation.");
}

function parseWith<T>(schema: z.ZodType<T>, raw: unknown, message: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError("malformed_input", message, {
      details: { issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
    });
  }
  return result.data;
}

/** Provider failure summary for logs: class, HTTP status, provider code, first line of message. Never bodies. */
function describeCause(cause: unknown): Record<string, unknown> | null {
  if (!cause || typeof cause !== "object") return null;
  const c = cause as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  return {
    name: typeof c.name === "string" ? c.name : null,
    status: typeof c.status === "number" ? c.status : null,
    code: typeof c.code === "string" ? c.code : null,
    message: typeof c.message === "string" ? c.message.split("\n")[0].slice(0, 200) : null,
  };
}

export type RouteHandler<Ctx> = (request: Request, ctx: Ctx, requestId: string) => Promise<Response>;

/**
 * Wraps a handler: assigns a request ID, converts thrown errors to the shared
 * error body, and logs 5xx with the request ID only (no bodies, no secrets).
 */
export function route<Ctx = unknown>(handler: RouteHandler<Ctx>) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    const requestId = newRequestId();
    const started = Date.now();
    try {
      return await handler(request, ctx, requestId);
    } catch (thrown) {
      const error = toApiError(thrown);
      if (error.status >= 500) {
        console.error(
          JSON.stringify({
            requestId,
            code: error.code,
            status: error.status,
            path: new URL(request.url).pathname,
            ms: Date.now() - started,
            cause: describeCause(error.cause),
          }),
        );
      }
      return jsonError(error, requestId);
    }
  };
}

// ── Redirects and cookies (OAuth flows) ──────────────────────────────────────

export interface CookieOptions {
  maxAgeSeconds: number;
  secure: boolean;
  path?: string;
}

/** httpOnly, SameSite=Lax cookie string. Lax is required so the provider's redirect back still carries it. */
export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? "/"}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** 302 with no-store and any cookies to set; used by browser-facing OAuth routes. */
export function redirectTo(location: string, init: { requestId: string; cookies?: string[] }): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store", "X-Request-Id": init.requestId });
  for (const cookie of init.cookies ?? []) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}
