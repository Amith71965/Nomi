import { beforeEach, describe, expect, it } from "vitest";
import { CATALOG, findIntegration, linkableProviders } from "@/lib/connections/catalog";
import { buildConnectionsView } from "@/lib/connections/service";
import { parseEnv } from "@/lib/env";
import { connectionsViewSchema } from "@/lib/schemas/connections";
import { LINK_INPUT, connectionStore } from "./helpers/fake-connections";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-09-13T12:00:00.000Z");

const BASE = {
  APP_ORIGIN: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk",
  SUPABASE_SERVICE_ROLE_KEY: "sk",
};
const LINKING = {
  GOOGLE_CLIENT_ID: "client",
  GOOGLE_CLIENT_SECRET: "secret",
  INTEGRATIONS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

describe("catalog", () => {
  it("has unique keys, exactly one linkable provider, and plain copy on every entry", () => {
    const keys = CATALOG.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(linkableProviders()).toEqual(["google_calendar"]);
    for (const item of CATALOG) {
      expect(item.tagline.length).toBeGreaterThan(10);
      if (item.kind === "link") expect(item.enables.length).toBeGreaterThan(0);
      if (item.kind === "included") expect(item.requires).not.toBeNull();
      if (item.kind === "external") expect(item.externalUrl).toMatch(/^https:/);
    }
    expect(findIntegration("google_calendar")?.name).toBe("Google Calendar");
  });
});

describe("buildConnectionsView", () => {
  beforeEach(() => connectionStore.reset());

  it("marks linking unavailable when the deployment has no Google client, and never says Linked", () => {
    const view = buildConnectionsView({ env: parseEnv(BASE), rows: [], now: NOW });
    connectionsViewSchema.parse(view);
    const google = view.integrations.find((i) => i.key === "google_calendar");
    expect(google?.status).toBe("unavailable");
    expect(google?.connectPath).toBeNull();
    expect(view.server.linking.ready).toBe(false);
    expect(view.integrations.some((i) => i.status === "linked")).toBe(false);
  });

  it("offers Connect when linking is configured but the user has no row", () => {
    const view = buildConnectionsView({ env: parseEnv({ ...BASE, ...LINKING }), rows: [], now: NOW });
    const google = view.integrations.find((i) => i.key === "google_calendar");
    expect(google?.status).toBe("not_linked");
    expect(google?.connectPath).toBe("/api/integrations/google/start");
    expect(google?.unlinkPath).toBeNull();
    expect(google?.account).toBeNull();
  });

  it("shows Linked with the account label only from a real row, and Unlink instead of Connect", async () => {
    await connectionStore.link(USER_A, LINK_INPUT);
    const rows = await connectionStore.list(USER_A);
    const view = buildConnectionsView({ env: parseEnv({ ...BASE, ...LINKING }), rows, now: NOW });
    const google = view.integrations.find((i) => i.key === "google_calendar");
    expect(google?.status).toBe("linked");
    expect(google?.account).toEqual({ email: "person@example.com", label: "Primary calendar · person@example.com" });
    expect(google?.unlinkPath).toBe("/api/integrations/google");
    expect(google?.connectPath).toBeNull();
    expect(JSON.stringify(view)).not.toContain("sealed-refresh-token");
  });

  it("goes back to Connect after unlinking, and an error row offers both renew and unlink", async () => {
    await connectionStore.link(USER_A, LINK_INPUT);
    expect(await connectionStore.secret(USER_A, "google_calendar")).toEqual({ ciphertext: LINK_INPUT.refreshTokenCiphertext, keyVersion: 1 });
    await connectionStore.revoke(USER_A, "google_calendar");
    expect(await connectionStore.secret(USER_A, "google_calendar")).toBeNull();
    let view = buildConnectionsView({ env: parseEnv({ ...BASE, ...LINKING }), rows: await connectionStore.list(USER_A), now: NOW });
    expect(view.integrations.find((i) => i.key === "google_calendar")?.status).toBe("not_linked");

    await connectionStore.link(USER_A, LINK_INPUT);
    await connectionStore.markError(USER_A, "google_calendar", "invalid_grant");
    view = buildConnectionsView({ env: parseEnv({ ...BASE, ...LINKING }), rows: await connectionStore.list(USER_A), now: NOW });
    const google = view.integrations.find((i) => i.key === "google_calendar");
    expect(google?.status).toBe("error");
    expect(google?.connectPath).not.toBeNull();
    expect(google?.unlinkPath).not.toBeNull();
    expect(await connectionStore.secret(USER_A, "google_calendar")).toBeNull();
  });

  it("keeps users apart", async () => {
    await connectionStore.link(USER_A, LINK_INPUT);
    expect(await connectionStore.list(USER_B)).toEqual([]);
    expect(await connectionStore.get(USER_B, "google_calendar")).toBeNull();
  });

  it("reports included capabilities from server readiness, never as something to configure", () => {
    const off = buildConnectionsView({ env: parseEnv(BASE), rows: [], now: NOW });
    expect(off.integrations.find((i) => i.key === "assistant_model")?.status).toBe("not_ready");
    expect(off.integrations.find((i) => i.key === "grocery_research")?.status).toBe("not_ready");
    const on = buildConnectionsView({
      env: parseEnv({ ...BASE, OPENROUTER_API_KEY: "k", PRODUCT_SEARCH_API_KEY: "s", ENABLE_VOICE: "true", DEEPGRAM_API_KEY: "d" }),
      rows: [],
      now: NOW,
    });
    for (const key of ["assistant_model", "grocery_research", "voice"]) {
      const item = on.integrations.find((i) => i.key === key);
      expect(item?.status).toBe("included");
      expect(item?.connectPath).toBeNull();
    }
    expect(on.integrations.find((i) => i.key === "maps")?.status).toBe("external");
    expect(on.integrations.find((i) => i.key === "email_payments")?.status).toBe("never");
  });
});
