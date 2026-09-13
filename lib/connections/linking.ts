import type { LinkableProvider, UnlinkResult } from "@/types/contracts";
import { SupabaseConnectionStore, type ConnectionStore } from "@/lib/connections/store";
import { openBox, sealBox } from "@/lib/crypto";
import { getEnv, googleLinkingConfigured, type Env } from "@/lib/env";
import { serializeCookie } from "@/lib/http";
import { GoogleOAuthClient, GoogleOAuthError } from "@/lib/integrations/google-oauth";
import { OAUTH_STATE_TTL_MS, createOAuthState, verifyOAuthState } from "@/lib/oauth-state";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Per-user app linking. Starts the OAuth dance, completes it by sealing the
 * refresh token into the user's `connections` row, and unlinks by revoking at
 * the provider and dropping the sealed token. The plaintext refresh token
 * exists only inside these functions.
 */

export const OAUTH_STATE_COOKIE = "nomi_oauth_state";
export const GOOGLE_CALLBACK_PATH = "/api/integrations/google/callback";
export const CONNECTIONS_PAGE = "/app/connections";

export type LinkFailureReason = "denied" | "state" | "provider" | "no_refresh_token" | "unavailable";

export type LinkOutcome = { outcome: "linked"; accountLabel: string } | { outcome: "failed"; reason: LinkFailureReason };

const PROVIDER: LinkableProvider = "google_calendar";

export class LinkingService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: { store: ConnectionStore; google: GoogleOAuthClient; env: Env; now?: () => Date },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  private get key(): string {
    const key = this.deps.env.INTEGRATIONS_ENCRYPTION_KEY;
    if (!key) throw new Error("linking not configured");
    return key;
  }

  private get secure(): boolean {
    return this.deps.env.APP_ORIGIN.startsWith("https://");
  }

  /** Authorization URL plus the state cookie to set. */
  startGoogle(userId: string): { url: string; cookie: string } {
    const state = createOAuthState({ userId, provider: PROVIDER, now: this.now() }, this.key);
    return {
      url: this.deps.google.authorizationUrl(state),
      cookie: serializeCookie(OAUTH_STATE_COOKIE, state, { maxAgeSeconds: OAUTH_STATE_TTL_MS / 1000, secure: this.secure }),
    };
  }

  clearStateCookie(): string {
    return serializeCookie(OAUTH_STATE_COOKIE, "", { maxAgeSeconds: 0, secure: this.secure });
  }

  async completeGoogle(input: {
    userId: string;
    code: string | null;
    state: string | null;
    cookieState: string | null;
    providerError: string | null;
  }): Promise<LinkOutcome> {
    const verdict = verifyOAuthState(
      { state: input.state, cookieState: input.cookieState, userId: input.userId, provider: PROVIDER, now: this.now() },
      this.key,
    );
    if (!verdict.ok) return { outcome: "failed", reason: "state" };
    if (input.providerError !== null) return { outcome: "failed", reason: input.providerError === "access_denied" ? "denied" : "provider" };
    if (!input.code) return { outcome: "failed", reason: "provider" };

    let tokens;
    try {
      tokens = await this.deps.google.exchangeCode(input.code);
    } catch (e) {
      if (e instanceof GoogleOAuthError) return { outcome: "failed", reason: "provider" };
      throw e;
    }
    if (!tokens.refreshToken) return { outcome: "failed", reason: "no_refresh_token" };

    let email: string | null = null;
    let sub: string | null = null;
    try {
      const profile = await this.deps.google.userInfo(tokens.accessToken);
      email = profile.email ?? null;
      sub = profile.sub;
    } catch (e) {
      if (!(e instanceof GoogleOAuthError)) throw e;
      // The link is still usable without a label; keep going with a generic one.
    }

    const accountLabel = email ? `Primary calendar · ${email}` : "Primary calendar";
    await this.deps.store.link(input.userId, {
      provider: PROVIDER,
      accountEmail: email,
      accountLabel,
      externalAccountId: sub,
      scopes: tokens.scope,
      targetId: "primary",
      refreshTokenCiphertext: sealBox(tokens.refreshToken, this.key),
      keyVersion: 1,
    });
    return { outcome: "linked", accountLabel };
  }

  /** Null when nothing is linked. Google is asked to revoke; Nomi's copy is dropped either way. */
  async unlinkGoogle(userId: string): Promise<UnlinkResult | null> {
    const row = await this.deps.store.get(userId, PROVIDER);
    if (!row || row.status === "revoked") return null;
    let providerRevoked = false;
    const secret = await this.deps.store.secret(userId, PROVIDER);
    if (secret) {
      try {
        providerRevoked = await this.deps.google.revoke(openBox(secret.ciphertext, this.key));
      } catch {
        providerRevoked = false;
      }
    }
    await this.deps.store.revoke(userId, PROVIDER);
    return { provider: PROVIDER, status: "revoked", providerRevoked };
  }
}

/** Null when the deployment has no Google client; routes turn that into an honest "unavailable". */
export function linkingServiceFromEnv(): LinkingService | null {
  const env = getEnv();
  if (!googleLinkingConfigured(env) || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return new LinkingService({
    store: new SupabaseConnectionStore(createAdminSupabase()),
    google: new GoogleOAuthClient({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${env.APP_ORIGIN}${GOOGLE_CALLBACK_PATH}`,
    }),
    env,
  });
}
