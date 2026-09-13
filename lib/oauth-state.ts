import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { LinkableProvider } from "@/types/contracts";
import { oauthStatePayloadSchema, type OAuthStatePayload } from "@/lib/schemas/google";

/**
 * OAuth `state`: a signed, time-limited token bound to the signed-in user and
 * the provider. The same value is also set as an httpOnly cookie, so the
 * callback checks three things: the signature, the cookie match, and that the
 * session user is the one who started the link. Keyed with the sealing key.
 */

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function hmac(keyBase64: string, data: string): Buffer {
  return createHmac("sha256", Buffer.from(keyBase64, "base64")).update(data).digest();
}

export function createOAuthState(input: { userId: string; provider: LinkableProvider; now: Date }, keyBase64: string): string {
  const payload: OAuthStatePayload = {
    u: input.userId,
    n: randomBytes(16).toString("base64url"),
    t: input.now.getTime(),
    p: input.provider,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${hmac(keyBase64, encoded).toString("base64url")}`;
}

export type StateVerdict = { ok: true; payload: OAuthStatePayload } | { ok: false; reason: "missing" | "mismatch" | "signature" | "expired" | "user" | "malformed" };

export function verifyOAuthState(
  input: { state: string | null; cookieState: string | null; userId: string; provider: LinkableProvider; now: Date },
  keyBase64: string,
): StateVerdict {
  if (!input.state || !input.cookieState) return { ok: false, reason: "missing" };
  const a = Buffer.from(input.state);
  const b = Buffer.from(input.cookieState);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "mismatch" };

  const dot = input.state.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };
  const encoded = input.state.slice(0, dot);
  const sig = Buffer.from(input.state.slice(dot + 1), "base64url");
  const expected = hmac(keyBase64, encoded);
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return { ok: false, reason: "signature" };

  let payload: OAuthStatePayload;
  try {
    payload = oauthStatePayloadSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (input.now.getTime() - payload.t > OAUTH_STATE_TTL_MS || payload.t > input.now.getTime() + 60_000) {
    return { ok: false, reason: "expired" };
  }
  if (payload.u !== input.userId || payload.p !== input.provider) return { ok: false, reason: "user" };
  return { ok: true, payload };
}
