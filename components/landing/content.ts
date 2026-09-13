/**
 * Landing copy and status data. Integration statuses are the only place a
 * "Live" label can come from, and it must be set by hand after verification.
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

export type IntegrationStatus = "live" | "in_build" | "external_link" | "planned" | "not_planned";

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  live: "Live",
  in_build: "In build",
  external_link: "External link",
  planned: "Planned",
  not_planned: "Not planned",
};

export const STATUS_HELP: Record<IntegrationStatus, string> = {
  live: "Verified against the real provider.",
  in_build: "Being wired now. Not yet verified end to end.",
  external_link: "Opens the provider in a new tab. No data is exchanged.",
  planned: "On the roadmap. Nothing is connected.",
  not_planned: "Deliberately out of scope.",
};

export const INTEGRATIONS: ReadonlyArray<{ name: string; status: IntegrationStatus; text: string }> = [
  { name: "Google Calendar", status: "in_build", text: "Creates one event on a dedicated calendar after you approve the exact details." },
  { name: "Shopping search", status: "in_build", text: "Search listings for the items you need, normalized with honest unknowns." },
  { name: "Voice input", status: "in_build", text: "Push to talk, review the transcript, then send. Nothing is saved until you press Send." },
  { name: "Maps", status: "external_link", text: "Opens a map search for your chosen city. Nomi does not claim to know store stock." },
  { name: "Notes export", status: "planned", text: "Send a decision to your notes app. Later." },
  { name: "Email and payments", status: "not_planned", text: "Nomi will not send mail or move money. Those stay in your hands." },
];

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
    q: "Is this a public product?",
    a: "Not yet. This is a private preview built around one complete workflow. Sign-in is limited to the demo account.",
  },
] as const;
