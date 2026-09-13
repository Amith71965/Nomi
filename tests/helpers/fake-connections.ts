import { InMemoryConnectionStore } from "@/lib/connections/store";

export const connectionStore = new InMemoryConnectionStore(() => new Date("2026-09-13T12:00:00.000Z"));

export const LINK_INPUT = {
  provider: "google_calendar" as const,
  accountEmail: "person@example.com",
  accountLabel: "Primary calendar · person@example.com",
  externalAccountId: "google-sub-123",
  scopes: ["https://www.googleapis.com/auth/calendar.events"],
  targetId: "primary",
  refreshTokenCiphertext: "v1.nonce.sealed-refresh-token-ciphertext.tag",
  keyVersion: 1,
};
