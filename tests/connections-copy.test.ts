import { describe, expect, it } from "vitest";
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE, linkNotice } from "@/components/connections/copy";
import { INTEGRATIONS, STATUS_LABEL as LANDING_LABEL } from "@/components/landing/content";
import { CATALOG } from "@/lib/connections/catalog";
import { integrationKindSchema, integrationStatusSchema } from "@/lib/schemas/connections";

describe("connections copy", () => {
  it("labels every status and kind, and only a real link reads as Linked", () => {
    for (const status of integrationStatusSchema.options) {
      expect(STATUS_LABEL[status].length).toBeGreaterThan(0);
      expect(STATUS_TONE[status]).toBeDefined();
      if (status !== "linked") expect(STATUS_LABEL[status]).not.toMatch(/^(Linked|Connected|Live)$/);
    }
    for (const kind of integrationKindSchema.options) expect(KIND_LABEL[kind].length).toBeGreaterThan(0);
  });

  it("turns redirect params into one honest sentence, or nothing", () => {
    expect(linkNotice({ linked: "google_calendar" })?.tone).toBe("success");
    expect(linkNotice({ link_error: "denied" })?.text).toMatch(/declined/);
    expect(linkNotice({ link_error: "state" })?.text).toMatch(/expired|match/);
    expect(linkNotice({ link_error: "no_refresh_token" })?.text).toMatch(/offline access/);
    expect(linkNotice({ unlinked: "google_calendar", provider_revoked: "1" })?.tone).toBe("neutral");
    expect(linkNotice({ unlinked: "google_calendar", provider_revoked: "0" })?.tone).toBe("warning");
    expect(linkNotice({ link_error: "<script>" })).toBeNull();
    expect(linkNotice({})).toBeNull();
  });
});

describe("landing integrations", () => {
  it("come from the catalogue and never claim Live or Connected", () => {
    expect(INTEGRATIONS.map((i) => i.name)).toEqual(CATALOG.map((c) => c.name));
    for (const item of INTEGRATIONS) {
      expect(LANDING_LABEL[item.status]).not.toMatch(/Live|Connected/);
    }
    expect(INTEGRATIONS.find((i) => i.name === "Google Calendar")?.status).toBe("connect_own");
    expect(INTEGRATIONS.find((i) => i.name === "Grocery research")?.status).toBe("included");
  });
});
