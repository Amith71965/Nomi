import { ApiError } from "@/lib/errors";
import { googleTokenErrorSchema, googleTokenResponseSchema, googleUserInfoSchema, type GoogleUserInfo } from "@/lib/schemas/google";

/**
 * Google OAuth 2.0 for per-user linking. One confidential client for the
 * deployment; each user grants their own account. Only the endpoints below
 * are ever called; nothing here reads or writes calendar data.
 */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/** Least privilege: create/read events Nomi created, plus the account email for the label. */
export const GOOGLE_CALENDAR_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"] as const;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string[];
}

export class GoogleOAuthError extends ApiError {
  readonly providerCode: string | null;
  constructor(message: string, providerCode: string | null, options: { retryable?: boolean; status?: "provider_error" | "provider_unavailable" } = {}) {
    super(options.status ?? "provider_error", message, { retryable: options.retryable ?? false, details: { providerCode } });
    this.name = "GoogleOAuthError";
    this.providerCode = providerCode;
  }
}

export class GoogleOAuthClient {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly options: { clientId: string; clientSecret: string; redirectUri: string; fetchImpl?: FetchLike; timeoutMs?: number },
  ) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  get redirectUri(): string {
    return this.options.redirectUri;
  }

  authorizationUrl(state: string): string {
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set("client_id", this.options.clientId);
    url.searchParams.set("redirect_uri", this.options.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<GoogleTokens> {
    const body = new URLSearchParams({
      code,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      redirect_uri: this.options.redirectUri,
      grant_type: "authorization_code",
    });
    return this.tokenRequest(body);
  }

  async refresh(refreshToken: string): Promise<GoogleTokens> {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      grant_type: "refresh_token",
    });
    return this.tokenRequest(body);
  }

  /** True when Google confirmed the revocation. False (not a throw) when it did not, so callers can still drop their copy. */
  async revoke(token: string): Promise<boolean> {
    try {
      const res = await this.fetchImpl(GOOGLE_REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }).toString(),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async userInfo(accessToken: string): Promise<GoogleUserInfo> {
    let res: Response;
    try {
      res = await this.fetchImpl(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch {
      throw new GoogleOAuthError("Could not reach Google.", null, { status: "provider_unavailable", retryable: true });
    }
    if (!res.ok) throw new GoogleOAuthError("Google did not return the account profile.", `userinfo_${res.status}`);
    const parsed = googleUserInfoSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new GoogleOAuthError("Unexpected profile response from Google.", "userinfo_shape");
    return parsed.data;
  }

  private async tokenRequest(body: URLSearchParams): Promise<GoogleTokens> {
    let res: Response;
    try {
      res = await this.fetchImpl(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch {
      throw new GoogleOAuthError("Could not reach Google.", null, { status: "provider_unavailable", retryable: true });
    }
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = googleTokenErrorSchema.safeParse(raw);
      const code = err.success ? err.data.error : `http_${res.status}`;
      if (res.status >= 500) throw new GoogleOAuthError("Google is unavailable.", code, { status: "provider_unavailable", retryable: true });
      throw new GoogleOAuthError("Google rejected the token request.", code);
    }
    const parsed = googleTokenResponseSchema.safeParse(raw);
    if (!parsed.success) throw new GoogleOAuthError("Unexpected token response from Google.", "token_shape");
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token ?? null,
      expiresIn: parsed.data.expires_in,
      scope: parsed.data.scope.split(" ").filter((s) => s.length > 0),
    };
  }
}
