import type { AssistantResponse, InputKind, SuggestedAction } from "@/types/contracts";
import type { Capabilities } from "@/lib/ai/prompts";
import { runTurn, type OrchestratorDeps } from "@/lib/ai/orchestrator";
import { shoppingConfigured, voiceConfigured, type Env } from "@/lib/env";
import { ApiError, toApiError } from "@/lib/errors";
import { assistantResponseSchema, type AssistantRequestInput } from "@/lib/schemas/assistant";
import type { TurnRow } from "@/lib/schemas/db";

export const TURN_DEADLINE_MS = 25_000;

/** Research and calendar switch on when their phases land; voice follows env. */
export function capabilitiesFromEnv(env: Env): Capabilities {
  return {
    research: shoppingConfigured(env),
    calendar: false, // Enabled per user only after checking their linked account.
    voice: voiceConfigured(env),
  };
}

export interface ProcessInput {
  userId: string;
  body: AssistantRequestInput;
  now: Date;
  deadlineMs?: number;
}

/**
 * Turn lifecycle around the orchestrator: idempotency on client request id,
 * one active turn per user, suggestion resolution from the stored source
 * turn, deadline, and failure recording. Throws ApiError for the route.
 */
export async function processAssistantRequest(deps: OrchestratorDeps, input: ProcessInput): Promise<AssistantResponse> {
  const { userId, body, now } = input;
  const deadlineMs = input.deadlineMs ?? TURN_DEADLINE_MS;

  let inputText: string;
  let inputKind: InputKind;
  let direct: ((turnId: string) => AssistantResponse) | null = null;

  if ("text" in body) {
    inputText = body.text;
    inputKind = body.inputKind;
  } else {
    const source = await deps.turns.get(userId, body.sourceTurnId);
    if (!source) throw new ApiError("not_found", "That suggestion's source turn was not found.");
    if (!source.include_in_context) {
      throw new ApiError("stale_context", "Your memories changed since this suggestion was made. Ask again to get fresh suggestions.");
    }
    const action = resolveSuggestion(source, body.suggestionId);
    if (!action) throw new ApiError("not_found", "That suggestion was not found on its source turn.");
    const plan = planForSuggestion(action);
    if (plan.kind === "unsupported") throw new ApiError("unsupported_operation", plan.reason);
    inputText = plan.text;
    inputKind = "suggestion";
    direct = plan.kind === "direct" ? plan.respond : null;
  }

  const begun = await deps.turns.begin(userId, { conversationId: body.conversationId, clientRequestId: body.clientRequestId, inputText, inputKind });
  let row: TurnRow;
  switch (begun.kind) {
    case "busy":
      throw new ApiError("turn_in_progress", "Nomi is still working on your previous request.");
    case "rate_limited":
      throw new ApiError("rate_limited", "Too many requests in the last minute. Wait a moment.");
    case "existing": {
      if (begun.row.status === "completed") {
        const stored = assistantResponseSchema.safeParse(begun.row.response);
        if (stored.success) return stored.data;
        throw new ApiError("internal_error", "The stored response for this request is invalid.");
      }
      if (begun.row.status === "processing") throw new ApiError("turn_in_progress", "This request is still being processed.");
      const reopened = await deps.turns.reopen(userId, begun.row.id);
      if (reopened.kind !== "reopened") throw new ApiError("turn_in_progress", "Nomi is still working on your previous request.");
      row = reopened.row;
      break;
    }
    case "created":
      row = begun.row;
      break;
  }

  try {
    const response = direct
      ? direct(row.id)
      : (
          await withDeadline(
            runTurn(deps, {
              userId,
              turnId: row.id,
              conversationId: body.conversationId,
              inputText,
              inputKind,
              timeZone: body.timeZone,
              now,
              signal: AbortSignal.timeout(deadlineMs),
            }),
            deadlineMs,
          )
        ).response;
    await deps.turns.complete(userId, row.id, response, []);
    return response;
  } catch (thrown) {
    const error = toApiError(thrown);
    await deps.turns.fail(userId, row.id, error.code);
    throw error;
  }
}

export function resolveSuggestion(source: TurnRow, suggestionId: string): SuggestedAction | null {
  const parsed = assistantResponseSchema.safeParse(source.response);
  if (!parsed.success) return null;
  return parsed.data.suggested_actions.find((a) => a.id === suggestionId) ?? null;
}

type SuggestionPlan =
  | { kind: "model"; text: string }
  | { kind: "direct"; text: string; respond: (turnId: string) => AssistantResponse }
  | { kind: "unsupported"; reason: string };

/** How each allowlisted intent becomes a turn. Unimplemented intents fail closed and are never offered. */
export function planForSuggestion(action: SuggestedAction): SuggestionPlan {
  switch (action.intent.kind) {
    case "open_memory":
      return {
        kind: "direct",
        text: "[suggestion] View memories",
        respond: (turnId) => ({
          schemaVersion: "1",
          turnId,
          message: "Your memories are in the Memory panel. You can edit or delete any of them there; changes apply to the next answer.",
          speak: null,
          memory_updates: [],
          ui: [],
          suggested_actions: [],
          requested_action: null,
        }),
      };
    case "review_curry_ingredients":
      return {
        kind: "model",
        text: "Which ingredients for tonight's plan should I check before shopping? List them as suggestions only; do not assume anything is missing.",
      };
    case "research_groceries":
      return {
        kind: "model",
        text: "Find grocery options for the items I said I'm out of or low on. Search only those confirmed needs, compare the results, and recommend one option per item with the evidence behind it.",
      };
    case "show_item":
    case "sort_results":
      return { kind: "unsupported", reason: "Switch items and sort directly on the results card." };
    case "schedule_grocery_run":
      return { kind: "model", text: "Propose a grocery run on my linked calendar. Use a future time and ask me if the time is unclear. Do not create an event; show the approval card." };
  }
}

async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError("deadline_exceeded", "The request took too long.")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
