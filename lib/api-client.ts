import { z } from "zod";
import type {
  ActionPatchRequest,
  ActionView,
  AssistantRequest,
  AssistantResponse,
  ConnectionsView,
  MemoryRecord,
  TranscriptionView,
  TurnView,
} from "@/types/contracts";
import { actionViewSchema } from "@/lib/schemas/actions";
import { assistantResponseSchema } from "@/lib/schemas/assistant";
import { connectionsViewSchema } from "@/lib/schemas/connections";
import { memoryRecordSchema } from "@/lib/schemas/memory";
import { transcriptionViewSchema } from "@/lib/schemas/transcription";
import { turnsListSchema } from "@/lib/schemas/turns";

/**
 * Browser-side API client. Same-origin, cookie-authenticated, every response
 * validated with the wire schemas before the UI sees it. Errors carry the
 * server's code so the UI can name one recovery action.
 */

export class ClientApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

const errorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }),
  requestId: z.string().optional(),
});

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  fetchImpl?: FetchLike;
  baseUrl?: string;
}

export class ApiClient {
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(options: ApiClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.baseUrl = options.baseUrl ?? "";
  }

  private async request<T>(path: string, schema: z.ZodType<T> | null, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        credentials: "same-origin",
        ...init,
        headers: { accept: "application/json", ...(init.headers ?? {}) },
      });
    } catch {
      throw new ClientApiError("network", "Could not reach Nomi. Check your connection and try again.", 0, true, null);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let raw: unknown = null;
    try {
      raw = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      raw = null;
    }
    if (!res.ok) {
      const parsed = errorBodySchema.safeParse(raw);
      if (parsed.success) {
        throw new ClientApiError(parsed.data.error.code, parsed.data.error.message, res.status, parsed.data.error.retryable, parsed.data.requestId ?? null);
      }
      throw new ClientApiError("http_error", `Request failed (${res.status}).`, res.status, res.status >= 500, null);
    }
    if (schema === null) return undefined as T;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ClientApiError("invalid_response", "Nomi returned something the app could not read.", res.status, true, null);
    return parsed.data;
  }

  private jsonInit(method: string, body: unknown): RequestInit {
    return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  }

  assistant(body: AssistantRequest): Promise<AssistantResponse> {
    return this.request("/api/assistant", assistantResponseSchema, this.jsonInit("POST", body));
  }

  async turns(conversationId: string): Promise<TurnView[]> {
    const out = await this.request(`/api/turns?conversationId=${encodeURIComponent(conversationId)}`, turnsListSchema);
    return out.turns;
  }

  async memories(): Promise<MemoryRecord[]> {
    const out = await this.request("/api/memories", z.object({ memories: z.array(memoryRecordSchema) }));
    return out.memories;
  }

  deleteMemory(id: string, version: number): Promise<void> {
    return this.request(`/api/memories/${encodeURIComponent(id)}`, null, this.jsonInit("DELETE", { version, confirmed: true }));
  }

  async completeMemory(id: string, version: number): Promise<MemoryRecord> {
    const out = await this.request(`/api/memories/${encodeURIComponent(id)}`, z.object({ memory: memoryRecordSchema }), this.jsonInit("PATCH", { version, status: "completed" }));
    return out.memory;
  }

  async shoppingLocation(): Promise<{ location: string | null }> {
    return this.request("/api/preferences/location", z.object({ location: z.string().nullable(), verified: z.boolean().nullable() }));
  }

  setShoppingLocation(location: string): Promise<{ location: string; verified: boolean }> {
    return this.request("/api/preferences/location", z.object({ location: z.string(), verified: z.boolean() }), this.jsonInit("PUT", { location }));
  }

  clearShoppingLocation(): Promise<void> {
    return this.request("/api/preferences/location", null, { method: "DELETE", headers: { "content-type": "application/json" } });
  }

  connections(): Promise<ConnectionsView> {
    return this.request("/api/connections", connectionsViewSchema);
  }

  transcribe(audio: Blob, mimeType: string): Promise<TranscriptionView> {
    const form = new FormData();
    form.append("audio", new File([audio], "recording", { type: mimeType }));
    return this.request("/api/transcribe", transcriptionViewSchema, { method: "POST", body: form });
  }

  action(id: string): Promise<ActionView> {
    return this.request(`/api/actions/${encodeURIComponent(id)}`, actionViewSchema);
  }

  approveAction(id: string, version: number): Promise<ActionView> {
    return this.request(`/api/actions/${encodeURIComponent(id)}/approve`, actionViewSchema, this.jsonInit("POST", { version }));
  }

  cancelAction(id: string, version: number): Promise<ActionView> {
    return this.request(`/api/actions/${encodeURIComponent(id)}/cancel`, actionViewSchema, this.jsonInit("POST", { version }));
  }

  patchAction(id: string, body: ActionPatchRequest): Promise<ActionView> {
    return this.request(`/api/actions/${encodeURIComponent(id)}`, actionViewSchema, this.jsonInit("PATCH", body));
  }
}

export const api = new ApiClient();
