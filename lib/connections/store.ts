import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinkableProvider } from "@/types/contracts";
import { ApiError } from "@/lib/errors";
import { connectionRowSchema, type ConnectionRow } from "@/lib/schemas/db";

/**
 * Storage seam for linked apps. Public reads never select the token column;
 * `secret()` is the single path that returns the sealed refresh token, and only
 * for a row that is currently linked.
 */

export interface LinkInput {
  provider: LinkableProvider;
  accountEmail: string | null;
  accountLabel: string;
  externalAccountId: string | null;
  scopes: string[];
  targetId: string;
  refreshTokenCiphertext: string;
  keyVersion: number;
}

export interface ConnectionSecret {
  ciphertext: string;
  keyVersion: number;
}

export interface ConnectionStore {
  list(userId: string): Promise<ConnectionRow[]>;
  get(userId: string, provider: LinkableProvider): Promise<ConnectionRow | null>;
  /** Upsert on (user, provider): a re-link replaces the token and clears any error. */
  link(userId: string, input: LinkInput): Promise<ConnectionRow>;
  /** Drops the sealed token and marks the row revoked. Returns null when nothing was linked. */
  revoke(userId: string, provider: LinkableProvider): Promise<ConnectionRow | null>;
  markError(userId: string, provider: LinkableProvider, code: string): Promise<void>;
  secret(userId: string, provider: LinkableProvider): Promise<ConnectionSecret | null>;
}

const PUBLIC_COLUMNS =
  "id,user_id,provider,status,account_email,account_label,external_account_id,target_id,scopes,linked_at,revoked_at,last_verified_at,error_code,created_at,updated_at";

// ── Supabase implementation ─────────────────────────────────────────────────

export class SupabaseConnectionStore implements ConnectionStore {
  constructor(private readonly db: SupabaseClient) {}

  async list(userId: string): Promise<ConnectionRow[]> {
    const { data, error } = await this.db.from("connections").select(PUBLIC_COLUMNS).eq("user_id", userId).order("provider");
    if (error) throw dbError("connections.list", error.message);
    return connectionRowSchema.array().parse(data ?? []);
  }

  async get(userId: string, provider: LinkableProvider): Promise<ConnectionRow | null> {
    const { data, error } = await this.db
      .from("connections")
      .select(PUBLIC_COLUMNS)
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();
    if (error) throw dbError("connections.get", error.message);
    return data ? connectionRowSchema.parse(data) : null;
  }

  async link(userId: string, input: LinkInput): Promise<ConnectionRow> {
    const { data, error } = await this.db
      .from("connections")
      .upsert(
        {
          user_id: userId,
          provider: input.provider,
          status: "linked",
          account_email: input.accountEmail,
          account_label: input.accountLabel,
          external_account_id: input.externalAccountId,
          target_id: input.targetId,
          scopes: input.scopes,
          refresh_token_ciphertext: input.refreshTokenCiphertext,
          token_key_version: input.keyVersion,
          linked_at: new Date().toISOString(),
          revoked_at: null,
          error_code: null,
        },
        { onConflict: "user_id,provider" },
      )
      .select(PUBLIC_COLUMNS)
      .single();
    if (error) throw dbError("connections.link", error.message);
    return connectionRowSchema.parse(data);
  }

  async revoke(userId: string, provider: LinkableProvider): Promise<ConnectionRow | null> {
    const { data, error } = await this.db
      .from("connections")
      .update({ status: "revoked", refresh_token_ciphertext: null, revoked_at: new Date().toISOString(), error_code: null })
      .eq("user_id", userId)
      .eq("provider", provider)
      .in("status", ["linked", "error"])
      .select(PUBLIC_COLUMNS)
      .maybeSingle();
    if (error) throw dbError("connections.revoke", error.message);
    return data ? connectionRowSchema.parse(data) : null;
  }

  async markError(userId: string, provider: LinkableProvider, code: string): Promise<void> {
    const { error } = await this.db
      .from("connections")
      .update({ status: "error", error_code: code })
      .eq("user_id", userId)
      .eq("provider", provider)
      .eq("status", "linked");
    if (error) throw dbError("connections.markError", error.message);
  }

  async secret(userId: string, provider: LinkableProvider): Promise<ConnectionSecret | null> {
    const { data, error } = await this.db
      .from("connections")
      .select("refresh_token_ciphertext,token_key_version")
      .eq("user_id", userId)
      .eq("provider", provider)
      .eq("status", "linked")
      .maybeSingle();
    if (error) throw dbError("connections.secret", error.message);
    if (!data || typeof data.refresh_token_ciphertext !== "string") return null;
    return { ciphertext: data.refresh_token_ciphertext, keyVersion: Number(data.token_key_version) };
  }
}

function dbError(operation: string, message: string): ApiError {
  return new ApiError("provider_unavailable", "The database request failed.", { details: { operation, message } });
}

// ── In-memory implementation (tests only) ───────────────────────────────────

interface StoredRow extends ConnectionRow {
  refresh_token_ciphertext: string | null;
  token_key_version: number;
}

export class InMemoryConnectionStore implements ConnectionStore {
  private rows = new Map<string, StoredRow>();
  private seq = 0;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  reset(): void {
    this.rows.clear();
  }

  private key(userId: string, provider: string): string {
    return `${userId}:${provider}`;
  }

  private strip(row: StoredRow): ConnectionRow {
    const { refresh_token_ciphertext: _c, token_key_version: _v, ...pub } = row;
    void _c;
    void _v;
    return pub;
  }

  async list(userId: string): Promise<ConnectionRow[]> {
    return [...this.rows.values()].filter((r) => r.user_id === userId).map((r) => this.strip(r));
  }

  async get(userId: string, provider: LinkableProvider): Promise<ConnectionRow | null> {
    const row = this.rows.get(this.key(userId, provider));
    return row ? this.strip(row) : null;
  }

  async link(userId: string, input: LinkInput): Promise<ConnectionRow> {
    const now = this.clock().toISOString();
    const existing = this.rows.get(this.key(userId, input.provider));
    this.seq += 1;
    const row: StoredRow = {
      id: existing?.id ?? `00000000-0000-4000-8000-${this.seq.toString().padStart(12, "0")}`,
      user_id: userId,
      provider: input.provider,
      status: "linked",
      account_email: input.accountEmail,
      account_label: input.accountLabel,
      external_account_id: input.externalAccountId,
      target_id: input.targetId,
      scopes: input.scopes,
      refresh_token_ciphertext: input.refreshTokenCiphertext,
      token_key_version: input.keyVersion,
      linked_at: now,
      revoked_at: null,
      last_verified_at: null,
      error_code: null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    this.rows.set(this.key(userId, input.provider), row);
    return this.strip(row);
  }

  async revoke(userId: string, provider: LinkableProvider): Promise<ConnectionRow | null> {
    const row = this.rows.get(this.key(userId, provider));
    if (!row || row.status === "revoked") return null;
    const updated: StoredRow = {
      ...row,
      status: "revoked",
      refresh_token_ciphertext: null,
      revoked_at: this.clock().toISOString(),
      error_code: null,
      updated_at: this.clock().toISOString(),
    };
    this.rows.set(this.key(userId, provider), updated);
    return this.strip(updated);
  }

  async markError(userId: string, provider: LinkableProvider, code: string): Promise<void> {
    const row = this.rows.get(this.key(userId, provider));
    if (!row || row.status !== "linked") return;
    this.rows.set(this.key(userId, provider), { ...row, status: "error", error_code: code, updated_at: this.clock().toISOString() });
  }

  async secret(userId: string, provider: LinkableProvider): Promise<ConnectionSecret | null> {
    const row = this.rows.get(this.key(userId, provider));
    if (!row || row.status !== "linked" || row.refresh_token_ciphertext === null) return null;
    return { ciphertext: row.refresh_token_ciphertext, keyVersion: row.token_key_version };
  }
}
