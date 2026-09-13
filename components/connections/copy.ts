import type { BadgeTone } from "@/components/ui/badge";
import type { IntegrationKind, IntegrationStatus } from "@/types/contracts";

/** Labels for real statuses. There is no label that implies a link exists without a row. */
export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  linked: "Linked",
  not_linked: "Not linked",
  error: "Needs attention",
  unavailable: "Not available yet",
  included: "Included",
  not_ready: "Not ready",
  external: "External link",
  planned: "Planned",
  never: "Not planned",
};

export const STATUS_TONE: Record<IntegrationStatus, BadgeTone> = {
  linked: "success",
  not_linked: "accent",
  error: "warning",
  unavailable: "neutral",
  included: "success",
  not_ready: "neutral",
  external: "neutral",
  planned: "neutral",
  never: "neutral",
};

export const KIND_LABEL: Record<IntegrationKind, string> = {
  link: "You link it",
  included: "Included with Nomi",
  external: "Opens another site",
  planned: "Coming later",
  never: "Out of scope",
};

export type Notice = { tone: "success" | "warning" | "neutral"; text: string };

const LINK_ERRORS: Record<string, string> = {
  denied: "You declined the Google permission. Nothing was linked.",
  state: "That link attempt expired or did not match this session. Start again from the card below.",
  provider: "Google did not complete the link. Nothing was stored. Try again in a moment.",
  no_refresh_token: "Google did not grant offline access, so Nomi could not keep the link. Try again and accept the permission.",
  unavailable: "Linking is not set up on this deployment yet.",
};

/** Turns the redirect query from the linking routes into one plain sentence, or nothing. */
export function linkNotice(params: { linked?: string; link_error?: string; unlinked?: string; provider_revoked?: string }): Notice | null {
  if (params.linked === "google_calendar") {
    return { tone: "success", text: "Google Calendar is linked. Nomi can create an event there only after you approve each one." };
  }
  if (params.unlinked === "google_calendar") {
    return params.provider_revoked === "1"
      ? { tone: "neutral", text: "Google Calendar is unlinked. Nomi's access was revoked at Google and its copy removed." }
      : {
          tone: "warning",
          text: "Google Calendar is unlinked and Nomi removed its copy of the access. Google did not confirm the revocation; you can also remove Nomi under your Google account's third-party access.",
        };
  }
  if (params.link_error && params.link_error in LINK_ERRORS) return { tone: "warning", text: LINK_ERRORS[params.link_error] };
  return null;
}

export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
