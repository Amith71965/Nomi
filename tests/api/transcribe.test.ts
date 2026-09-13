import { beforeEach, describe, expect, it, vi } from "vitest";
import { USER_A } from "../helpers/fake-stores";

const auth = vi.hoisted(() => ({ current: null as null | { userId: string; email: string | null; isDemoUser: boolean } }));
const fakeEnv = vi.hoisted(() => ({
  APP_ORIGIN: "http://localhost:3000",
  ENABLE_VOICE: true,
  TRANSCRIPTION_PROVIDER: "deepgram",
  DEEPGRAM_API_KEY: "dg-secret",
  DEEPGRAM_MODEL: "nova-3",
  OPENAI_API_KEY: "",
  OPENAI_TRANSCRIBE_MODEL: "gpt-4o-mini-transcribe",
}));
const provider = vi.hoisted(() => ({ transcriber: null as null | { name: string; model: string; transcribe: (i: unknown) => Promise<unknown> } }));

vi.mock("@/lib/auth", async () => {
  const { ApiError } = await import("@/lib/errors");
  return {
    requireUser: async () => {
      if (!auth.current) throw new ApiError("unauthenticated", "Sign in to continue.");
      return auth.current;
    },
    requireDemoUser: () => undefined,
  };
});
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getEnv: () => fakeEnv };
});
vi.mock("@/lib/integrations/transcription", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/transcription")>();
  return { ...actual, transcriberFromEnv: () => provider.transcriber };
});

import { POST } from "@/app/api/transcribe/route";

const ORIGIN = "http://localhost:3000";
function upload(file: File | null, extra: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const form = new FormData();
  if (file) form.set("audio", file);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return new Request(`${ORIGIN}/api/transcribe`, { method: "POST", headers: { origin: ORIGIN, ...headers }, body: form });
}
const wav = () => new File([new Uint8Array(2048)], "clip.wav", { type: "audio/wav" });

describe("POST /api/transcribe", () => {
  beforeEach(() => {
    auth.current = { userId: USER_A, email: null, isDemoUser: true };
    provider.transcriber = {
      name: "deepgram",
      model: "nova-3",
      transcribe: async () => ({ text: "I'm out of tomatoes.", confidence: 0.98, durationSeconds: 2.1, provider: "deepgram", model: "nova-3" }),
    };
  });

  it("401 without a session", async () => {
    auth.current = null;
    expect((await POST(upload(wav()), undefined)).status).toBe(401);
  });

  it("403 on a cross-origin request", async () => {
    expect((await POST(upload(wav(), {}, { origin: "http://evil.example" }), undefined)).status).toBe(403);
  });

  it("503 provider_unavailable when voice is not enabled, never a fake transcript", async () => {
    provider.transcriber = null;
    const res = await POST(upload(wav()), undefined);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("provider_unavailable");
  });

  it("400 without an audio field and 400 for a non-audio type", async () => {
    expect((await POST(upload(null, { note: "x" }), undefined)).status).toBe(400);
    expect((await POST(upload(new File([new Uint8Array(10)], "a.txt", { type: "text/plain" })), undefined)).status).toBe(400);
  });

  it("413 for an oversized declared body", async () => {
    const res = await POST(upload(wav(), {}, { "content-length": String(10 * 1024 * 1024) }), undefined);
    expect(res.status).toBe(413);
  });

  it("200 returns the transcript with no-store and does not touch memory", async () => {
    const res = await POST(upload(wav()), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ text: "I'm out of tomatoes.", confidence: 0.98, durationSeconds: 2.1, provider: "deepgram", model: "nova-3" });
  });

  it("400 when the provider reports a recording longer than 30 seconds", async () => {
    provider.transcriber!.transcribe = async () => ({ text: "long", confidence: null, durationSeconds: 45, provider: "deepgram", model: "nova-3" });
    const res = await POST(upload(wav()), undefined);
    expect(res.status).toBe(400);
  });
});
