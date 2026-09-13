import type { IntegrationKind, LinkableProvider } from "@/types/contracts";

/**
 * The catalogue of apps and capabilities Nomi can work with. This is the only
 * place their names and plain-language feature copy live; the onboarding
 * screen, the connections API, and the landing page render from it.
 *
 * Kinds are honest about who configures what:
 *  - link      the user links their own account from inside the product
 *  - included  Nomi provides it; the user configures nothing (server key)
 *  - external  opens another site; Nomi claims nothing about it
 *  - planned   not built yet
 *  - never     Nomi will not do this
 */
export interface IntegrationDefinition {
  key: string;
  name: string;
  kind: IntegrationKind;
  provider: LinkableProvider | null;
  tagline: string;
  /** What linking or having this enables, as short plain sentences. */
  enables: readonly string[];
  /** What Nomi will never do with it. */
  never: readonly string[];
  /** For `included`: which server capability must be ready for it to count. */
  requires: "model" | "shopping" | "voice" | null;
  externalUrl: string | null;
}

export const CATALOG: readonly IntegrationDefinition[] = [
  {
    key: "google_calendar",
    name: "Google Calendar",
    kind: "link",
    provider: "google_calendar",
    tagline: "Turns an approved plan into one real event on your own calendar.",
    enables: [
      "Schedule a grocery run as an event you can open in Google Calendar.",
      "See the exact title, time, and description before anything is created.",
      "Unlink whenever you like; Nomi keeps no access afterwards.",
    ],
    never: ["Read or change your existing events.", "Invite people or send emails.", "Create anything without your Allow."],
    requires: null,
    externalUrl: null,
  },
  {
    key: "assistant_model",
    name: "Assistant model",
    kind: "included",
    provider: null,
    tagline: "Understands what you say and keeps facts, suggestions, and interests apart.",
    enables: [
      "Say what ran out or what you are cooking; each fact becomes an editable memory.",
      "Ask what to buy later and get an answer grounded in your own memories.",
    ],
    never: ["Save something you only asked about or wondered aloud.", "Act on another app by itself."],
    requires: "model",
    externalUrl: null,
  },
  {
    key: "grocery_research",
    name: "Grocery research",
    kind: "included",
    provider: null,
    tagline: "Looks up a few real listings for what you need, with the source on every field.",
    enables: [
      "Up to three sourced product cards per item with the retrieval time shown.",
      "Missing prices, stock, or ratings are shown as unknown, not guessed.",
    ],
    never: ["Invent a price, a stock level, or a saving.", "Place an order or move money."],
    requires: "shopping",
    externalUrl: null,
  },
  {
    key: "voice",
    name: "Voice input",
    kind: "included",
    provider: null,
    tagline: "Push to talk, read the transcript, then send it yourself.",
    enables: ["Speak instead of typing; the transcript is editable before it is sent."],
    never: ["Keep the audio.", "Send anything before you press Send."],
    requires: "voice",
    externalUrl: null,
  },
  {
    key: "maps",
    name: "Maps",
    kind: "external",
    provider: null,
    tagline: "Opens a map search near you for stores. Nomi does not claim to know their stock.",
    enables: ["One tap to a map search for grocery stores in your area."],
    never: ["Report store hours or stock as facts."],
    requires: null,
    externalUrl: "https://www.google.com/maps/search/grocery+store",
  },
  {
    key: "notes_export",
    name: "Notes export",
    kind: "planned",
    provider: null,
    tagline: "Send a decision to your notes app.",
    enables: ["Later: export a shopping decision with its evidence."],
    never: [],
    requires: null,
    externalUrl: null,
  },
  {
    key: "email_payments",
    name: "Email and payments",
    kind: "never",
    provider: null,
    tagline: "Nomi will not send mail or move money. Those stay in your hands.",
    enables: [],
    never: ["Send email on your behalf.", "Pay for anything."],
    requires: null,
    externalUrl: null,
  },
];

export function findIntegration(key: string): IntegrationDefinition | undefined {
  return CATALOG.find((item) => item.key === key);
}

export function linkableProviders(): readonly LinkableProvider[] {
  return CATALOG.flatMap((item) => (item.provider ? [item.provider] : []));
}
