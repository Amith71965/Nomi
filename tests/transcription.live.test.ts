import "dotenv/config";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DeepgramTranscriber } from "@/lib/integrations/transcription";

/** Live Deepgram smoke test. Skips without DEEPGRAM_API_KEY. Sends one second of silence. */
const key = process.env.DEEPGRAM_API_KEY;

describe.skipIf(!key)("Deepgram live", () => {
  it("accepts a WAV upload and returns a transcript string", async () => {
    const t = new DeepgramTranscriber({ apiKey: key ?? "", model: process.env.DEEPGRAM_MODEL ?? "nova-3" });
    const wav = readFileSync("fixtures/audio/silence-1s.wav");
    const result = await t.transcribe({ audio: new Uint8Array(wav), mimeType: "audio/wav", signal: AbortSignal.timeout(20_000) });
    expect(typeof result.text).toBe("string");
    expect(result.provider).toBe("deepgram");
    expect(result.durationSeconds).toBeGreaterThan(0.5);
  }, 30_000);
});
