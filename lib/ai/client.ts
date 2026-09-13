import OpenAI, { APIConnectionTimeoutError, APIError } from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { getEnv } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import type { ChatToolDefinition } from "@/lib/schemas/tools";

/**
 * Minimal model boundary. The orchestrator only speaks this interface, so
 * tests use a scripted fake and production uses OpenRouter through the
 * OpenAI-compatible Chat Completions API.
 */

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCallRequest[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolCallRequest {
  id: string;
  name: string;
  argumentsJson: string;
}

export interface ModelRequest {
  messages: ChatMessage[];
  tools: ChatToolDefinition[];
  /** When present, the final answer must be JSON matching this schema. */
  responseSchema?: { name: string; schema: Record<string, unknown> };
  toolChoice?: "auto" | "none" | "required";
  signal?: AbortSignal;
}

export type ModelResponse =
  | { kind: "tool_calls"; calls: ToolCallRequest[]; content: string | null }
  | { kind: "final"; content: string }
  | { kind: "refusal"; reason: string }
  | { kind: "incomplete"; reason: "length" | "content_filter" | "unknown" };

export interface ModelClient {
  readonly model: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export const MODEL_TIMEOUT_MS = 25_000;

function toSdkMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m): ChatCompletionMessageParam => {
    switch (m.role) {
      case "system":
        return { role: "system", content: m.content };
      case "user":
        return { role: "user", content: m.content };
      case "assistant":
        return m.toolCalls && m.toolCalls.length > 0
          ? {
              role: "assistant",
              content: m.content,
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: "function" as const,
                function: { name: c.name, arguments: c.argumentsJson },
              })),
            }
          : { role: "assistant", content: m.content ?? "" };
      case "tool":
        return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
  });
}

export class OpenRouterClient implements ModelClient {
  private readonly sdk: OpenAI;
  readonly model: string;

  constructor(options: {
    apiKey: string;
    baseURL: string;
    model: string;
    siteUrl?: string;
    appName?: string;
    timeoutMs?: number;
  }) {
    this.model = options.model;
    this.sdk = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: options.timeoutMs ?? MODEL_TIMEOUT_MS,
      maxRetries: 1,
      defaultHeaders: {
        ...(options.siteUrl ? { "HTTP-Referer": options.siteUrl } : {}),
        ...(options.appName ? { "X-Title": options.appName } : {}),
      },
    });
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const tools: ChatCompletionTool[] = request.tools.map((t) => ({
      type: "function",
      function: {
        name: t.function.name,
        description: t.function.description,
        strict: true,
        parameters: t.function.parameters,
      },
    }));

    try {
      const completion = await this.sdk.chat.completions.create(
        {
          model: this.model,
          messages: toSdkMessages(request.messages),
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? (request.toolChoice ?? "auto") : undefined,
          parallel_tool_calls: tools.length > 0 ? false : undefined,
          temperature: 0.2,
          response_format: request.responseSchema
            ? {
                type: "json_schema",
                json_schema: { name: request.responseSchema.name, strict: true, schema: request.responseSchema.schema },
              }
            : undefined,
        },
        { signal: request.signal },
      );

      const choice = completion.choices[0];
      if (!choice) return { kind: "incomplete", reason: "unknown" };
      const message = choice.message;

      if (message.refusal) return { kind: "refusal", reason: message.refusal };

      const calls = (message.tool_calls ?? []).flatMap((c) =>
        c.type === "function" ? [{ id: c.id, name: c.function.name, argumentsJson: c.function.arguments }] : [],
      );
      if (calls.length > 0) return { kind: "tool_calls", calls, content: message.content ?? null };

      if (choice.finish_reason === "length") return { kind: "incomplete", reason: "length" };
      if (choice.finish_reason === "content_filter") return { kind: "incomplete", reason: "content_filter" };
      if (typeof message.content !== "string" || message.content.length === 0) return { kind: "incomplete", reason: "unknown" };
      return { kind: "final", content: message.content };
    } catch (error) {
      throw toModelError(error);
    }
  }
}

function toModelError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof APIConnectionTimeoutError) {
    return new ApiError("deadline_exceeded", "The model took too long to respond.", { cause: error });
  }
  if (error instanceof APIError) {
    if (error.status === 429) return new ApiError("rate_limited", "The model provider is rate limiting requests.", { cause: error });
    if (error.status === 401 || error.status === 403) {
      return new ApiError("provider_error", "The model provider rejected the credentials.", { retryable: false, cause: error });
    }
    return new ApiError("provider_error", "The model provider returned an error.", { cause: error });
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new ApiError("deadline_exceeded", "The request was cancelled by the deadline.", { cause: error });
  }
  return new ApiError("provider_unavailable", "Could not reach the model provider.", { cause: error });
}

let cached: ModelClient | undefined;

export function modelClientFromEnv(): ModelClient {
  if (cached) return cached;
  const env = getEnv();
  cached = new OpenRouterClient({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: env.OPENROUTER_BASE_URL,
    model: env.NOMI_MODEL,
    siteUrl: env.OPENROUTER_SITE_URL,
    appName: env.OPENROUTER_APP_NAME,
  });
  return cached;
}
