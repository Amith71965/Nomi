import { describe, expect, it } from "vitest";
import fixture from "@/fixtures/deepgram-response.json";
import { AUDIO_MAX_BYTES, baseMimeType, isAllowedAudioType, validateAudioFile } from "@/lib/audio";
import { parseEnv } from "@/lib/env";
import { DeepgramTranscriber, transcriberFromEnv } from "@/lib/integrations/transcription";

function fakeFetch(status: number, body: unknown, capture?: { url?: string; init?: RequestInit }) {
  return async (url: string, init: RequestInit) => {
    if (capture) {
      capture.url = url;
      capture.init = init;
    }
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
}

const audio = new Uint8Array([82, 73, 70, 70]);

describe("DeepgramTranscriber", () => {
  it("sends the audio bytes with the Token header, the mime type, and nova-3 smart_format params", async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const t = new DeepgramTranscriber({ apiKey: "dg-secret", model: "nova-3", fetchImpl: fakeFetch(200, fixture, capture) });
    await t.transcribe({ audio, mimeType: "audio/webm;codecs=opus" });
    const url = new URL(capture.url!);
    expect(url.origin + url.pathname).toBe("https://api.deepgram.com/v1/listen");
    expect(url.searchParams.get("model")).toBe("nova-3");
    expect(url.searchParams.get("smart_format")).toBe("true");
    expect(url.searchParams.get("language")).toBe("en");
    const headers = capture.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Token dg-secret");
    expect(headers["Content-Type"]).toBe("audio/webm;codecs=opus");
    expect(capture.init!.method).toBe("POST");
    expect(capture.init!.body).toBe(audio);
  });

  it("parses the recorded response into a TranscriptionView", async () => {
    const t = new DeepgramTranscriber({ apiKey: "k", model: "nova-3", fetchImpl: fakeFetch(200, fixture) });
    const result = await t.transcribe({ audio, mimeType: "audio/wav" });
    expect(result).toEqual({
      text: "I'm out of tomatoes and potatoes. I'm cooking chicken curry tonight.",
      confidence: 0.9931,
      durationSeconds: 4.32,
      provider: "deepgram",
      model: "nova-3",
    });
  });

  it("returns an empty transcript (not an error) for silence", async () => {
    const silent = { metadata: { duration: 1 }, results: { channels: [{ alternatives: [{ transcript: "", confidence: 0 }] }] } };
    const t = new DeepgramTranscriber({ apiKey: "k", model: "nova-3", fetchImpl: fakeFetch(200, silent) });
    expect((await t.transcribe({ audio, mimeType: "audio/wav" })).text).toBe("");
  });

  it("maps provider failures to honest error codes and never invents text", async () => {
    const cases: Array<[number, string]> = [
      [401, "provider_error"],
      [403, "provider_error"],
      [429, "rate_limited"],
      [400, "malformed_input"],
      [500, "provider_error"],
    ];
    for (const [status, code] of cases) {
      const t = new DeepgramTranscriber({ apiKey: "k", model: "nova-3", fetchImpl: fakeFetch(status, { err_code: "x" }) });
      await expect(t.transcribe({ audio, mimeType: "audio/wav" })).rejects.toMatchObject({ code });
    }
    const weird = new DeepgramTranscriber({ apiKey: "k", model: "nova-3", fetchImpl: fakeFetch(200, { results: {} }) });
    await expect(weird.transcribe({ audio, mimeType: "audio/wav" })).rejects.toMatchObject({ code: "provider_error" });
    const notJson = new DeepgramTranscriber({ apiKey: "k", model: "nova-3", fetchImpl: fakeFetch(200, "<html>") });
    await expect(notJson.transcribe({ audio, mimeType: "audio/wav" })).rejects.toMatchObject({ code: "provider_error" });
  });

  it("maps an abort to deadline_exceeded", async () => {
    const t = new DeepgramTranscriber({
      apiKey: "k",
      model: "nova-3",
      fetchImpl: async () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      },
    });
    await expect(t.transcribe({ audio, mimeType: "audio/wav" })).rejects.toMatchObject({ code: "deadline_exceeded" });
  });
});

describe("transcriberFromEnv", () => {
  const base = {
    APP_ORIGIN: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk",
    SUPABASE_SERVICE_ROLE_KEY: "sk",
    DEMO_USER_ID: "6f1c2a1e-1b2c-4d3e-8f4a-5b6c7d8e9f01",
  };

  it("is null when voice is off, deepgram by default when on with a key", () => {
    expect(transcriberFromEnv(parseEnv(base))).toBeNull();
    const dg = transcriberFromEnv(parseEnv({ ...base, ENABLE_VOICE: "true", DEEPGRAM_API_KEY: "dg" }));
    expect(dg?.name).toBe("deepgram");
    expect(dg?.model).toBe("nova-3");
  });

  it("requires the selected provider's key only", () => {
    expect(() => parseEnv({ ...base, ENABLE_VOICE: "true" })).toThrow(/DEEPGRAM_API_KEY/);
    expect(() => parseEnv({ ...base, ENABLE_VOICE: "true", DEEPGRAM_API_KEY: "dg" })).not.toThrow();
    expect(() => parseEnv({ ...base, ENABLE_VOICE: "true", TRANSCRIPTION_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
    expect(() => parseEnv({ ...base, ENABLE_VOICE: "true", TRANSCRIPTION_PROVIDER: "openai", DEEPGRAM_API_KEY: "dg" })).toThrow(/OPENAI_API_KEY/);
    const oa = transcriberFromEnv(parseEnv({ ...base, ENABLE_VOICE: "true", TRANSCRIPTION_PROVIDER: "openai", OPENAI_API_KEY: "sk-x" }));
    expect(oa?.name).toBe("openai");
    expect(oa?.model).toBe("gpt-4o-mini-transcribe");
  });
});

describe("audio validation", () => {
  it("normalizes mime types and allows browser recording formats", () => {
    expect(baseMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(isAllowedAudioType("audio/webm;codecs=opus")).toBe(true);
    expect(isAllowedAudioType("audio/mp4")).toBe(true);
    expect(isAllowedAudioType("audio/wav")).toBe(true);
    expect(isAllowedAudioType("application/pdf")).toBe(false);
    expect(isAllowedAudioType("")).toBe(false);
  });

  it("rejects empty, oversized, and non-audio files with the documented codes", async () => {
    await expect(validateAudioFile(new File([], "a.wav", { type: "audio/wav" }))).rejects.toMatchObject({ code: "malformed_input" });
    await expect(validateAudioFile(new File([new Uint8Array(AUDIO_MAX_BYTES + 1)], "a.wav", { type: "audio/wav" }))).rejects.toMatchObject({ code: "payload_too_large", status: 413 });
    await expect(validateAudioFile(new File([new Uint8Array(10)], "a.txt", { type: "text/plain" }))).rejects.toMatchObject({ code: "malformed_input" });
    const ok = await validateAudioFile(new File([new Uint8Array([1, 2, 3])], "a.webm", { type: "audio/webm;codecs=opus" }));
    expect(ok.size).toBe(3);
    expect(ok.mimeType).toBe("audio/webm;codecs=opus");
  });
});
