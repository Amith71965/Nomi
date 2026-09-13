// Shared wire contracts between the Next.js UI and the API route handlers.
// Runtime validation lives in lib/schemas/*. Keep both in sync: changing this
// file is a breaking change (update schemas, fixtures, tests, README together).

export type ISODateTime = string; // RFC3339 with offset, e.g. 2026-09-11T17:30:00-04:00
export type UUID = string;
export type Category = "inventory" | "shopping_interest" | "task" | "plan" | "preference";
export type DataMode = "live" | "cached" | "fixture";
export type InputKind = "text" | "note" | "voice" | "suggestion";
export type MemorySource = "text" | "note" | "voice" | "manual_edit";
export type MemoryStatus = "active" | "completed" | "cancelled";
export type ActionKind = "calendar.create";
export type ActionStatus =
  | "proposed"
  | "executing"
  | "succeeded"
  | "failed"
  | "unknown"
  | "cancelled"
  | "expired";
export type TurnStatus = "processing" | "completed" | "failed";

// ── Memory ──────────────────────────────────────────────────────────────────

export interface MemoryView {
  id: UUID;
  category: Category;
  entity: string;
  summary: string;
  expiresAt: ISODateTime | null;
  version: number;
}

/** Full row as returned by the memory routes (superset of MemoryView). */
export interface MemoryRecord extends MemoryView {
  entityKey: string;
  value: Record<string, unknown>;
  status: MemoryStatus;
  confidence: number;
  source: MemorySource;
  sourceQuote: string;
  sourceTurnId: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface MemoryPatchRequest {
  version: number;
  value?: Record<string, unknown>;
  status?: MemoryStatus;
  expiresAt?: ISODateTime | null;
}

export interface MemoryDeleteRequest {
  version: number;
  confirmed: true;
}

// ── Research ────────────────────────────────────────────────────────────────

export interface Evidence {
  sourceUrl: string;
  sourceName: string;
  retrievedAt: ISODateTime;
  mode: DataMode;
}

export interface Product {
  id: string; // Server-assigned result ID, never a model-generated URL
  itemKey: string;
  title: string;
  imageUrl: string | null;
  merchant: string;
  priceAmount: number | null;
  currency: "USD" | null;
  unitLabel: string | null;
  normalizedPricePerKg: number | null;
  rating: number | null;
  reviewCount: number | null;
  availability: "in_stock" | "out_of_stock" | "unknown";
  fulfillment: "pickup" | "delivery" | "both" | "unknown";
  distanceKm: number | null;
  deliveryMinutes: number | null;
  destinationUrl: string;
  destinationKind: "merchant" | "search_listing";
  reason: string;
  score: number | null;
  scoreCoverage: number;
  evidence: Evidence;
}

// ── Calendar ────────────────────────────────────────────────────────────────

export interface CalendarDraft {
  title: string;
  startAt: ISODateTime; // RFC3339 offset required
  endAt: ISODateTime;
  timeZone: string; // Valid IANA identifier
  calendarLabel: string;
  location: string | null;
  description: string;
}

// ── Generative UI blocks (exactly five) ─────────────────────────────────────

export interface MemoryUpdateUI {
  type: "memory_update";
  data: { changes: Array<{ operation: "created" | "updated"; memory: MemoryView }> };
}

export interface ShoppingResultsUI {
  type: "shopping_results";
  data: {
    searchId: UUID;
    selectedItemKey: string;
    items: Array<{ key: string; label: string }>;
    products: Product[];
    notice: string | null;
  };
}

export interface DecisionCardUI {
  type: "decision_card";
  data: {
    title: string;
    confirmedNeeds: string[];
    suggestionsToCheck: string[];
    otherInterests: string[];
    recommendedProductId: string | null;
    reasons: string[];
    limitations: string[];
  };
}

export interface ApprovalCardUI {
  type: "approval_card";
  data: {
    actionId: UUID;
    version: number;
    kind: ActionKind;
    level: 2;
    expiresAt: ISODateTime;
    status: "proposed" | "executing" | "cancelled" | "expired" | "failed" | "unknown";
    preview: CalendarDraft;
  };
}

export interface CalendarConfirmationUI {
  type: "calendar_confirmation";
  data: {
    actionId: UUID;
    eventId: string;
    eventUrl: string;
    event: CalendarDraft;
    verifiedAt: ISODateTime;
    mode: "live"; // Fixture success can never use this production component
  };
}

export type UIBlock =
  | MemoryUpdateUI
  | ShoppingResultsUI
  | DecisionCardUI
  | ApprovalCardUI
  | CalendarConfirmationUI;

export type UIBlockType = UIBlock["type"];

// ── Suggested actions ───────────────────────────────────────────────────────

export type SuggestedIntent =
  | { kind: "research_groceries" }
  | { kind: "show_item"; itemKey: string; searchId: UUID }
  | { kind: "sort_results"; searchId: UUID; sort: "value" | "price" }
  | { kind: "review_curry_ingredients" }
  | { kind: "schedule_grocery_run"; sourceTurnId: UUID }
  | { kind: "open_memory" };

export type SuggestedIntentKind = SuggestedIntent["kind"];

export interface SuggestedAction {
  id: UUID;
  label: string;
  intent: SuggestedIntent;
}

// ── Assistant turn ──────────────────────────────────────────────────────────

export interface AssistantResponse {
  schemaVersion: "1";
  turnId: UUID;
  message: string;
  speak: string | null;
  memory_updates: MemoryView[]; // Server-derived committed changes
  ui: UIBlock[]; // At most 2 blocks per response
  suggested_actions: SuggestedAction[]; // At most 4
  requested_action: { id: UUID; version: number } | null;
}

export interface AssistantTextRequest {
  clientRequestId: UUID;
  conversationId: UUID;
  text: string;
  inputKind: Exclude<InputKind, "suggestion">;
  timeZone: string;
}

export interface AssistantSuggestionRequest {
  clientRequestId: UUID;
  conversationId: UUID;
  sourceTurnId: UUID;
  suggestionId: UUID;
  timeZone: string;
}

export type AssistantRequest = AssistantTextRequest | AssistantSuggestionRequest;

export interface TurnView {
  id: UUID;
  conversationId: UUID;
  inputText: string;
  inputKind: InputKind;
  status: TurnStatus;
  response: AssistantResponse | null;
  errorCode: string | null;
  createdAt: ISODateTime;
}

// ── Actions ─────────────────────────────────────────────────────────────────

export interface ActionView {
  id: UUID;
  version: number;
  kind: ActionKind;
  level: 2;
  status: ActionStatus;
  expiresAt: ISODateTime;
  preview: CalendarDraft;
  eventId: string | null;
  eventUrl: string | null;
  executedAt: ISODateTime | null;
  errorCode: string | null;
}

export interface ActionPatchRequest {
  version: number;
  title?: string;
  startAt?: ISODateTime;
  endAt?: ISODateTime;
  timeZone?: string;
  description?: string;
  location?: string | null;
}

export interface ActionVersionRequest {
  version: number;
}

// ── Connections ─────────────────────────────────────────────────────────────

export interface ConnectionsView {
  model: { ready: boolean; label: string };
  database: { ready: boolean };
  calendar: { ready: boolean; label: string; lastCheckedAt: ISODateTime | null };
  shopping: { ready: boolean; mode: DataMode };
  voice: { enabled: boolean };
}

// ── Errors ──────────────────────────────────────────────────────────────────

export interface ApiErrorBody {
  error: { code: string; message: string; retryable: boolean };
  requestId: string;
}
