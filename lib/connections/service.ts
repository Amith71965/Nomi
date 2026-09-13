import type { ConnectionsView, IntegrationStatus, IntegrationView } from "@/types/contracts";
import { CATALOG, type IntegrationDefinition } from "@/lib/connections/catalog";
import { SupabaseConnectionStore, type ConnectionStore } from "@/lib/connections/store";
import { getEnv, googleLinkingConfigured, modelConfigured, shoppingConfigured, voiceConfigured, type Env } from "@/lib/env";
import type { ConnectionRow } from "@/lib/schemas/db";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Paths the UI uses to start or end a link. Only providers that exist here are linkable. */
export const PROVIDER_PATHS: Record<string, { connect: string; unlink: string }> = {
  google_calendar: { connect: "/api/integrations/google/start", unlink: "/api/integrations/google" },
};

function includedReady(def: IntegrationDefinition, env: Env): boolean {
  switch (def.requires) {
    case "model":
      return modelConfigured(env);
    case "shopping":
      return shoppingConfigured(env);
    case "voice":
      return voiceConfigured(env);
    default:
      return true;
  }
}

function linkStatus(row: ConnectionRow | undefined, env: Env): { status: IntegrationStatus; detail: string | null } {
  if (!googleLinkingConfigured(env)) {
    return { status: "unavailable", detail: "Linking is not set up on this deployment yet." };
  }
  if (!row || row.status === "revoked") return { status: "not_linked", detail: null };
  if (row.status === "error") return { status: "error", detail: "The link stopped working. Connect again to renew it." };
  return { status: "linked", detail: null };
}

/** Pure: merges the catalogue with the user's own rows and server readiness. Never sees a token. */
export function buildConnectionsView(input: { env: Env; rows: ConnectionRow[]; now: Date }): ConnectionsView {
  const { env, rows, now } = input;
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  const integrations: IntegrationView[] = CATALOG.map((def) => {
    let status: IntegrationStatus;
    let detail: string | null = null;
    let account: IntegrationView["account"] = null;
    let linkedAt: string | null = null;
    let connectPath: string | null = null;
    let unlinkPath: string | null = null;

    if (def.kind === "link" && def.provider) {
      const row = byProvider.get(def.provider);
      ({ status, detail } = linkStatus(row, env));
      const paths = PROVIDER_PATHS[def.provider];
      if (status === "not_linked" || status === "error") connectPath = paths.connect;
      if (status === "linked" || status === "error") unlinkPath = paths.unlink;
      if (row && row.status !== "revoked") {
        account = { email: row.account_email, label: row.account_label };
        linkedAt = row.linked_at;
      }
    } else if (def.kind === "included") {
      const ready = includedReady(def, env);
      status = ready ? "included" : "not_ready";
      detail = ready ? null : "Not available on this deployment yet.";
    } else if (def.kind === "external") {
      status = "external";
    } else if (def.kind === "planned") {
      status = "planned";
    } else {
      status = "never";
    }

    return {
      key: def.key,
      name: def.name,
      kind: def.kind,
      status,
      tagline: def.tagline,
      enables: [...def.enables],
      never: [...def.never],
      account,
      linkedAt,
      detail,
      connectPath,
      unlinkPath,
      externalUrl: def.externalUrl,
    };
  });

  return {
    checkedAt: now.toISOString(),
    verification: "configuration_only",
    integrations,
    server: {
      model: { ready: modelConfigured(env), label: env.NOMI_MODEL },
      database: { ready: env.NEXT_PUBLIC_SUPABASE_URL.length > 0 && env.SUPABASE_SERVICE_ROLE_KEY.length > 0 },
      voice: { enabled: voiceConfigured(env), provider: voiceConfigured(env) ? env.TRANSCRIPTION_PROVIDER : null },
      linking: { ready: googleLinkingConfigured(env) },
    },
  };
}

export class ConnectionsService {
  constructor(
    private readonly store: ConnectionStore,
    private readonly env: Env,
  ) {}

  async view(userId: string, now: Date = new Date()): Promise<ConnectionsView> {
    const rows = await this.store.list(userId);
    return buildConnectionsView({ env: this.env, rows, now });
  }
}

export function connectionsServiceFromEnv(): ConnectionsService {
  return new ConnectionsService(new SupabaseConnectionStore(createAdminSupabase()), getEnv());
}
