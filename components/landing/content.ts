import type { IntegrationKind } from "@/types/contracts";
import { CATALOG } from "@/lib/connections/catalog";

/**
 * Landing copy. Integration cards derive from lib/connections/catalog.ts so the
 * marketing site and the in-app Linked apps page can never disagree.
 */

export const TAGLINE = "Tell it once. Pick up where life left off.";

export const STEPS = [
  { name: "Remember", text: "Say what ran out, what you're cooking, what you're considering. Nomi saves each as an editable fact." },
  { name: "Understand", text: "Later, ask what to buy. Confirmed needs, recipe suggestions, and ongoing interests stay separate." },
  { name: "Research", text: "Nomi looks up a few real listings and keeps the source and retrieval time on every field." },
  { name: "Recommend", text: "One clear recommendation, with the evidence behind it and the gaps in it." },
  { name: "Ask", text: "Before anything changes in another app, you see the exact event: date, time, calendar, description." },
  { name: "Act", text: "Only after Allow does Nomi create the event, once, and show you the real link." },
] as const;

export type IntegrationStatus = "connect_own" | "included" | "external_link" | "planned" | "not_planned";

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  connect_own: "Connect your own",
  included: "Included",
  external_link: "External link",
  planned: "Planned",
  not_planned: "Not planned",
};

export const STATUS_HELP: Record<IntegrationStatus, string> = {
  connect_own: "You link your own account from inside the app. Nothing is connected until you do.",
  included: "Provided by Nomi. Nothing for you to set up.",
  external_link: "Opens the provider in a new tab. No data is exchanged.",
  planned: "On the roadmap. Nothing is connected.",
  not_planned: "Deliberately out of scope.",
};

const KIND_TO_STATUS: Record<IntegrationKind, IntegrationStatus> = {
  link: "connect_own",
  included: "included",
  external: "external_link",
  planned: "planned",
  never: "not_planned",
};

/** Landing cards render from the same catalogue as the in-app Linked apps page. */
export const INTEGRATIONS: ReadonlyArray<{ name: string; status: IntegrationStatus; text: string }> = CATALOG.map((item) => ({
  name: item.name,
  status: KIND_TO_STATUS[item.kind],
  text: item.tagline,
}));

export const PRINCIPLES = [
  { title: "No write without Allow", text: "The model can propose. Only your approval, checked on the server, can execute." },
  { title: "Exactly one event", text: "Each approval maps to one stable event ID. A double click or a retry can never create a second one." },
  { title: "Unknown stays unknown", text: "Missing prices, stock, or ratings are shown as missing. Nothing is invented to fill a gap." },
] as const;

export const FAQ = [
  {
    q: "What does Nomi remember?",
    a: "Only things you explicitly state: an item that ran out, a dinner plan, something you're shopping for, a preference. Questions and guesses are not saved. Everything is visible, editable, and deletable.",
  },
  {
    q: "Can it buy things for me?",
    a: "No. Nomi researches listings and links you to them. Checkout, payment, and any sensitive authorization stay with you.",
  },
  {
    q: "What happens when I click Allow?",
    a: "The server checks that the proposal is still current and unexpired, claims it atomically, and creates one calendar event with a fixed ID. You get the real link. If the provider times out, Nomi checks by that ID instead of retrying blindly.",
  },
  {
    q: "What if the data is incomplete?",
    a: "Cards show what was actually found. A listing without a price says so. A recommendation with thin evidence is labelled as limited. Search results are listings, not live store stock.",
  },
  {
    q: "Can I use it today?",
    a: "Yes. Create an account, then choose which apps to link from inside Nomi. The preview is built around one complete workflow: memory, grocery research, and one approved calendar event on your own calendar.",
  },
] as const;
