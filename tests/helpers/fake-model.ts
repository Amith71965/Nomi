import type { ModelClient, ModelRequest, ModelResponse } from "@/lib/ai/client";
import type { ModelAnswer } from "@/lib/schemas/assistant";
import type { FlatValue } from "@/lib/tools/memory";

type Step = ModelResponse | ((request: ModelRequest) => ModelResponse);

/** Scripted model: each call consumes the next step. Records requests for assertions. */
export class FakeModel implements ModelClient {
  readonly model = "fake/model";
  readonly requests: ModelRequest[] = [];

  constructor(private readonly script: Step[]) {}

  async complete(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const next = this.script.shift();
    if (!next) throw new Error("FakeModel: no scripted response left");
    return typeof next === "function" ? next(request) : next;
  }
}

export function answer(partial: Partial<ModelAnswer> = {}): ModelResponse {
  const full: ModelAnswer = {
    message: "Done.",
    speak: null,
    clarifying_question: null,
    selected_product_ids: [],
    reason_codes: [],
    suggested_intent_names: [],
    decision: null,
    ...partial,
  };
  return { kind: "final", content: JSON.stringify(full) };
}

let counter = 0;
export function toolCall(name: string, args: unknown, id?: string): ModelResponse {
  counter += 1;
  return { kind: "tool_calls", content: null, calls: [{ id: id ?? `call_${counter}`, name, argumentsJson: JSON.stringify(args) }] };
}

export const DEMO_SENTENCE = "I'm out of tomatoes and potatoes. I'm cooking chicken curry tonight. I'm looking for running shoes.";

export const DEMO_CREATE_ARGS = {
  entries: [
    { category: "inventory", entity: "Tomatoes", entity_key: "tomatoes", value: flat({ availability: "out" }), quote: "I'm out of tomatoes", confidence: 0.96, expires_at: null },
    { category: "inventory", entity: "Potatoes", entity_key: "potatoes", value: flat({ availability: "out" }), quote: "I'm out of tomatoes and potatoes", confidence: 0.96, expires_at: null },
    { category: "plan", entity: "Chicken curry", entity_key: "chicken curry", value: flat({ meal: "chicken curry", local_date: null }), quote: "I'm cooking chicken curry tonight", confidence: 0.95, expires_at: null },
    { category: "shopping_interest", entity: "Running shoes", entity_key: "running shoes", value: flat({ intent: "research" }), quote: "I'm looking for running shoes", confidence: 0.9, expires_at: null },
  ],
};

export function flat(partial: Partial<FlatValue>): FlatValue {
  return { availability: null, meal: null, local_date: null, intent: null, group: null, note: null, ...partial };
}
