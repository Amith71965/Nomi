import "dotenv/config";
import { describe, expect, it } from "vitest";
import { OpenRouterClient } from "@/lib/ai/client";
import { modelAnswerSchema } from "@/lib/schemas/assistant";
import { toModelJsonSchema } from "@/lib/schemas/json-schema";
import { toolDefinitions } from "@/lib/schemas/tools";

/**
 * Live smoke test against OpenRouter. Skips without OPENROUTER_API_KEY.
 * Run once after pasting the key: npx vitest run tests/ai.live.test.ts
 */
const key = process.env.OPENROUTER_API_KEY;

function client(): OpenRouterClient {
  return new OpenRouterClient({
    apiKey: key ?? "",
    baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    model: process.env.NOMI_MODEL ?? "openai/gpt-4.1-mini",
    appName: "Nomi tests",
  });
}

describe.skipIf(!key)("OpenRouter live", () => {

  it("returns a strict JSON answer that validates", async () => {
    const result = await client().complete({
      messages: [
        { role: "system", content: "Reply with the JSON answer schema. Message: say hello in five words. No tools needed." },
        { role: "user", content: "hello" },
      ],
      tools: [],
      responseSchema: { name: "nomi_answer", schema: toModelJsonSchema(modelAnswerSchema) },
    });
    expect(result.kind).toBe("final");
    if (result.kind === "final") expect(modelAnswerSchema.safeParse(JSON.parse(result.content)).success).toBe(true);
  }, 30_000);

  it("performs a tool round trip with strict tool schemas", async () => {
    const result = await client().complete({
      messages: [
        { role: "system", content: "You must call get_memories with categories ['inventory'], entity_keys [] and limit 5 before answering." },
        { role: "user", content: "What am I out of?" },
      ],
      tools: toolDefinitions(["get_memories"]),
      toolChoice: "required",
    });
    expect(result.kind).toBe("tool_calls");
    if (result.kind === "tool_calls") {
      expect(result.calls[0]?.name).toBe("get_memories");
      expect(JSON.parse(result.calls[0]?.argumentsJson ?? "{}")).toMatchObject({ categories: ["inventory"] });
    }
  }, 30_000);
});
