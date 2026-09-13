import { randomUUID } from "node:crypto";
import type { AssistantResponse, DecisionCardUI, InputKind, MemoryRecord, MemoryView, UIBlock } from "@/types/contracts";
import type { ChatMessage, ModelClient, ToolCallRequest } from "@/lib/ai/client";
import { REPAIR_MESSAGE, buildContextMessage, buildSystemPrompt, type Capabilities } from "@/lib/ai/prompts";
import { buildSuggestedActions } from "@/lib/ai/suggestions";
import type { MemoryChange, MemoryService } from "@/lib/memory/service";
import { canonicalEntityKey } from "@/lib/memory/normalize";
import { selectRelevant } from "@/lib/memory/retrieve";
import { modelAnswerSchema, type ModelAnswer } from "@/lib/schemas/assistant";
import { toModelJsonSchema } from "@/lib/schemas/json-schema";
import { availableToolDefinitions, executeTool } from "@/lib/tools/registry";
import type { TurnStore } from "@/lib/turns/store";
import { localDateString } from "@/lib/time";

export const LIMITS = {
  rounds: 3,
  toolCalls: 5,
  searches: 2,
  contextMemories: 30,
  recentTurns: 6,
} as const;

export interface OrchestratorDeps {
  model: ModelClient;
  memory: MemoryService;
  turns: TurnStore;
  capabilities: Capabilities;
  newId?: () => string;
}

export interface TurnRun {
  userId: string;
  turnId: string;
  conversationId: string;
  inputText: string;
  inputKind: InputKind;
  timeZone: string;
  now: Date;
  signal?: AbortSignal;
}

export interface TurnOutcome {
  response: AssistantResponse;
  evidence: unknown[];
  /** For logging: how many model rounds and tool calls were used. */
  usage: { rounds: number; toolCalls: number; finished: "final" | "budget" | "refusal" | "incomplete" };
}

const RESPONSE_SCHEMA = { name: "nomi_answer", schema: toModelJsonSchema(modelAnswerSchema) };

const REASON_TEXT: Record<ModelAnswer["reason_codes"][number], string> = {
  lowest_unit_price: "Lowest listed unit price among these results; fees and tax not included.",
  highest_rated: "Highest rating with enough reviews to mean something.",
  closest: "Closest to your confirmed location.",
  fastest_delivery: "Fastest explicit delivery estimate.",
  most_complete_listing: "Most complete listing: price, unit, and stock were all present.",
  matches_confirmed_need: "Matches a need you confirmed.",
  no_comparable_prices: "Prices could not be compared: units or currency differ.",
  missing_unit_size: "Unit size was not listed, so per-unit price is unknown.",
  limited_evidence: "Limited evidence: several fields were missing.",
};

/**
 * One bounded turn: preload context, let the model call allowlisted tools
 * (≤ 3 rounds, ≤ 5 calls), then assemble the wire response on the server.
 * The model never produces trusted factual fields; it selects and explains.
 */
export async function runTurn(deps: OrchestratorDeps, run: TurnRun): Promise<TurnOutcome> {
  const newId = deps.newId ?? randomUUID;
  const source = run.inputKind === "suggestion" ? "text" : run.inputKind;
  const toolCtx = {
    userId: run.userId,
    turnId: run.turnId,
    inputText: run.inputText,
    now: run.now,
    timeZone: run.timeZone,
    source,
    memory: deps.memory,
    capabilities: deps.capabilities,
  };

  const records = await deps.memory.list(run.userId);
  const retrieved = selectRelevant(records, { intent: "all", now: run.now, timeZone: run.timeZone });
  const recent = await deps.turns.recentContext(run.userId, run.conversationId, LIMITS.recentTurns);
  const transcript = recent
    .slice()
    .reverse()
    .map((t) => ({ input: t.input_text, answer: extractMessage(t.response) }));

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt({ nowIso: run.now.toISOString(), timeZone: run.timeZone, localDate: localDateString(run.now, run.timeZone), capabilities: deps.capabilities }) },
    { role: "system", content: buildContextMessage({ memories: retrieved.context, staleInventory: retrieved.staleInventory, recentTurns: transcript }) },
    { role: "user", content: run.inputText },
  ];
  const tools = availableToolDefinitions(deps.capabilities);

  const changes: MemoryChange[] = [];
  let answer: ModelAnswer | null = null;
  let rounds = 0;
  let toolCalls = 0;
  let finished: TurnOutcome["usage"]["finished"] = "budget";
  let repaired = false;

  while (rounds < LIMITS.rounds && answer === null) {
    rounds += 1;
    const result = await deps.model.complete({
      messages,
      tools,
      responseSchema: RESPONSE_SCHEMA,
      toolChoice: toolCalls >= LIMITS.toolCalls ? "none" : "auto",
      signal: run.signal,
    });

    if (result.kind === "refusal") {
      finished = "refusal";
      break;
    }
    if (result.kind === "incomplete") {
      finished = "incomplete";
      break;
    }
    if (result.kind === "final") {
      const parsed = safeParseAnswer(result.content);
      if (parsed) {
        answer = parsed;
        finished = "final";
        break;
      }
      if (!repaired) {
        repaired = true;
        messages.push({ role: "assistant", content: result.content });
        messages.push({ role: "system", content: REPAIR_MESSAGE });
        continue;
      }
      break;
    }

    // Tool calls: execute sequentially within budget; results go back as data.
    messages.push({ role: "assistant", content: result.content, toolCalls: result.calls });
    for (const call of result.calls) {
      const execution = await runOneTool(call, toolCtx, toolCalls);
      toolCalls += 1;
      if (execution.ok) changes.push(...execution.memoryChanges);
      messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(execution.ok ? execution.result : { error: execution.error, detail: execution.detail }) });
    }
  }

  const finalRecords = changes.length > 0 ? await deps.memory.list(run.userId) : records;
  const response = assembleResponse({ run, answer, changes, records: finalRecords, capabilities: deps.capabilities, finished, newId });
  return { response, evidence: [], usage: { rounds, toolCalls, finished } };
}

async function runOneTool(call: ToolCallRequest, ctx: Parameters<typeof executeTool>[1], used: number) {
  if (used >= LIMITS.toolCalls) {
    return { ok: false as const, name: call.name, error: "unsupported_tool" as const, detail: "Tool budget for this turn is exhausted." };
  }
  return executeTool(call, ctx);
}

function safeParseAnswer(content: string): ModelAnswer | null {
  try {
    const parsed = modelAnswerSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function extractMessage(response: unknown): string {
  if (response && typeof response === "object" && "message" in response && typeof (response as { message: unknown }).message === "string") {
    return (response as { message: string }).message;
  }
  return "";
}

interface AssembleInput {
  run: TurnRun;
  answer: ModelAnswer | null;
  changes: MemoryChange[];
  records: MemoryRecord[];
  capabilities: Capabilities;
  finished: TurnOutcome["usage"]["finished"];
  newId: () => string;
}

function assembleResponse(input: AssembleInput): AssistantResponse {
  const { run, answer, changes, records, capabilities, finished, newId } = input;
  const dedupedChanges = dedupeChanges(changes);
  const memoryUpdates: MemoryView[] = dedupedChanges.map((c) => c.memory);

  const message = answer ? [answer.message, answer.clarifying_question].filter(Boolean).join("\n\n") : deterministicMessage(dedupedChanges, finished);

  const ui: UIBlock[] = [];
  if (dedupedChanges.length > 0) {
    ui.push({ type: "memory_update", data: { changes: dedupedChanges.map((c) => ({ operation: c.operation, memory: c.memory })) } });
  }
  if (answer?.decision && ui.length < 2) {
    ui.push(buildDecisionCard(answer, records));
  }

  const retrieved = selectRelevant(records, { intent: "today", now: run.now, timeZone: run.timeZone });
  const suggested_actions = buildSuggestedActions(
    {
      stage: dedupedChanges.length > 0 ? "memory_saved" : answer?.decision ? "decision" : "plain",
      capabilities,
      turnId: run.turnId,
      hasConfirmedNeeds: retrieved.needs.length > 0,
      hasPlanToday: retrieved.plansToday.length > 0,
      modelHints: answer?.suggested_intent_names ?? [],
    },
    newId,
  );

  return {
    schemaVersion: "1",
    turnId: run.turnId,
    message,
    speak: answer?.speak ?? null,
    memory_updates: memoryUpdates,
    ui,
    suggested_actions,
    requested_action: null,
  };
}

function dedupeChanges(changes: MemoryChange[]): MemoryChange[] {
  const byId = new Map<string, MemoryChange>();
  for (const c of changes) {
    const prev = byId.get(c.memory.id);
    byId.set(c.memory.id, prev ? { operation: prev.operation === "created" ? "created" : c.operation, memory: c.memory } : c);
  }
  return [...byId.values()];
}

function deterministicMessage(changes: MemoryChange[], finished: TurnOutcome["usage"]["finished"]): string {
  if (changes.length > 0) {
    const list = changes.map((c) => c.memory.summary.toLowerCase()).join("; ");
    return `Saved ${changes.length} ${changes.length === 1 ? "memory" : "memories"}: ${list}. I couldn't finish composing a fuller reply.`;
  }
  if (finished === "refusal") return "I can't help with that request. Nothing was changed.";
  return "I couldn't finish that request. Nothing was changed. Try again or rephrase.";
}

/** Factual fields come from committed memory rows; the model only selects keys. */
function buildDecisionCard(answer: ModelAnswer, records: MemoryRecord[]): DecisionCardUI {
  const decision = answer.decision!;
  const inventory = new Map(records.filter((r) => r.category === "inventory").map((r) => [r.entityKey, r] as const));
  const interests = new Map(records.filter((r) => r.category === "shopping_interest").map((r) => [r.entityKey, r] as const));

  const confirmedNeeds = uniq(
    decision.confirmed_need_keys
      .map((k) => inventory.get(canonicalEntityKey(k)))
      .filter((r): r is MemoryRecord => r !== undefined && (r.value.availability === "out" || r.value.availability === "low"))
      .map((r) => r.entity),
  );
  const otherInterests = uniq(
    decision.other_interest_keys
      .map((k) => interests.get(canonicalEntityKey(k)))
      .filter((r): r is MemoryRecord => r !== undefined)
      .map((r) => r.entity),
  );
  const suggestionsToCheck = uniq(decision.suggestion_keys.map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 60)).slice(0, 20);

  const limitations = [...decision.limitations];
  if (suggestionsToCheck.length > 0) limitations.push("Suggested ingredients are not confirmed shortages.");
  if (decision.confirmed_need_keys.length > confirmedNeeds.length) limitations.push("Some items could not be matched to saved memories and were left out.");

  return {
    type: "decision_card",
    data: {
      title: decision.title,
      confirmedNeeds,
      suggestionsToCheck,
      otherInterests,
      recommendedProductId: null,
      reasons: uniq(answer.reason_codes.map((code) => REASON_TEXT[code])).slice(0, 6),
      limitations: uniq(limitations).slice(0, 6),
    },
  };
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}
