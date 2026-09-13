import OpenAI, { APIError } from "openai";
import type { TranscriptionProviderName, TranscriptionView } from "@/types/contracts";
import type { Env } from "@/lib/env";
import { voiceConfigured } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { deepgramResponseSchema } from "@/lib/schemas/transcription";

/**
 * Speech-to-text behind POST /api/transcribe. Audio goes provider → text and
 * is discarded; nothing is stored until the user reviews and presses Send.
 * Deepgram is the default. OpenAI remains available for parity with the plan.
 */

export interface TranscribeInput {
  /** ArrayBuffer-backed so it is a valid fetch body and Blob part without casts. */
  audio: Uint8Array<ArrayBuffer>;
  mimeType: string;
  signal?: AbortSignal;
}

export interface Transcriber {
  readonly name: TranscriptionProviderName;
  readonly model: string;
  transcribe(input: TranscribeInput): Promise<TranscriptionView>;
}

export const TRANSCRIBE_TIMEOUT_MS = 20_000;
export const DEEPGRAM_BASE_URL = "https://api.deepgram.com";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class DeepgramTranscriber implements Transcriber {
  readonly name = "deepgram" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly fetchImpl: FetchLike;
  private readonly language: string;

  constructor(options: { apiKey: string; model: string; baseURL?: string; language?: string; fetchImpl?: FetchLike }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseURL = (options.baseURL ?? DEEPGRAM_BASE_URL).replace(/\/$/, "");
    this.language = options.language ?? "en";
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /** Query string sent to /v1/listen. Exposed for tests. */
  requestUrl(): string {
    const params = new URLSearchParams({ model: this.model, smart_format: "true", punctuate: "true", language: this.language });
    return `${this.baseURL}/v1/listen?${params.toString()}`;
  }

  async transcribe(input: TranscribeInput): Promise<TranscriptionView> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.requestUrl(), {
        method: "POST",
        headers: { Authorization: `Token ${this.apiKey}`, "Content-Type": input.mimeType, Accept: "application/json" },
        body: input.audio,
        signal: input.signal,
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw new ApiError("deadline_exceeded", "Transcription took too long.", { cause: error });
      }
      throw new ApiError("provider_unavailable", "Could not reach the transcription service.", { cause: error });
    }

    if (!res.ok) throw mapHttpError(res.status, "Deepgram");

    let body: unknown;
    try {
      body = await res.json();
    } catch (error) {
      throw new ApiError("provider_error", "The transcription service returned an unreadable response.", { cause: error });
    }
    const parsed = deepgramResponseSchema.safeParse(body);
    if (!parsed.success) throw new ApiError("provider_error", "The transcription service returned an unexpected shape.");

    const alternative = parsed.data.results.channels[0]?.alternatives[0];
    return {
      text: (alternative?.transcript ?? "").trim(),
      confidence: typeof alternative?.confidence === "number" ? clamp01(alternative.confidence) : null,
      durationSeconds: parsed.data.metadata?.duration ?? null,
      provider: this.name,
      model: this.model,
    };
  }
}

export class OpenAITranscriber implements Transcriber {
  readonly name = "openai" as const;
  readonly model: string;
  private readonly sdk: OpenAI;

  constructor(options: { apiKey: string; model: string; timeoutMs?: number }) {
    this.model = options.model;
    this.sdk = new OpenAI({ apiKey: options.apiKey, timeout: options.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS, maxRetries: 1 });
  }

  async transcribe(input: TranscribeInput): Promise<TranscriptionView> {
    const extension = input.mimeType.includes("wav") ? "wav" : input.mimeType.includes("mp4") || input.mimeType.includes("m4a") ? "m4a" : input.mimeType.includes("mpeg") || input.mimeType.includes("mp3") ? "mp3" : input.mimeType.includes("ogg") ? "ogg" : "webm";
    const file = new File([input.audio], `recording.${extension}`, { type: input.mimeType });
    try {
      const result = await this.sdk.audio.transcriptions.create({ file, model: this.model }, { signal: input.signal });
      return { text: result.text.trim(), confidence: null, durationSeconds: null, provider: this.name, model: this.model };
    } catch (error) {
      if (error instanceof APIError) throw mapHttpError(error.status ?? 502, "OpenAI");
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw new ApiError("deadline_exceeded", "Transcription took too long.", { cause: error });
      }
      throw new ApiError("provider_unavailable", "Could not reach the transcription service.", { cause: error });
    }
  }
}

function mapHttpError(status: number, provider: string): ApiError {
  if (status === 401 || status === 403) return new ApiError("provider_error", `${provider} rejected the credentials.`, { retryable: false });
  if (status === 429) return new ApiError("rate_limited", `${provider} is rate limiting requests.`);
  if (status === 400 || status === 415) return new ApiError("malformed_input", `${provider} could not decode the audio.`, { retryable: false });
  if (status === 413) return new ApiError("payload_too_large", "The recording is too large.");
  return new ApiError("provider_error", `${provider} returned an error.`);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Null when voice is disabled or the selected provider has no key: the route answers 503, never a fake transcript. */
export function transcriberFromEnv(env: Env): Transcriber | null {
  if (!voiceConfigured(env)) return null;
  if (env.TRANSCRIPTION_PROVIDER === "deepgram") {
    return new DeepgramTranscriber({ apiKey: env.DEEPGRAM_API_KEY ?? "", model: env.DEEPGRAM_MODEL });
  }
  return new OpenAITranscriber({ apiKey: env.OPENAI_API_KEY ?? "", model: env.OPENAI_TRANSCRIBE_MODEL });
}
