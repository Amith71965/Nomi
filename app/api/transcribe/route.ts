import { AUDIO_MAX_BYTES, AUDIO_MAX_SECONDS, validateAudioFile } from "@/lib/audio";
import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { assertSameOrigin, json, route } from "@/lib/http";
import { TRANSCRIBE_TIMEOUT_MS, transcriberFromEnv } from "@/lib/integrations/transcription";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Multipart upload with one `audio` file (≤ 3 MB, ≤ 30 s). Returns the
 * transcript for the user to review; no memory is written here.
 */
export const POST = route(async (request, _ctx, requestId) => {
  const env = getEnv();
  assertSameOrigin(request, env.APP_ORIGIN);
  await requireUser(request);

  const transcriber = transcriberFromEnv(env);
  if (!transcriber) {
    throw new ApiError("provider_unavailable", "Voice input is not enabled on this deployment.", { retryable: false });
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > AUDIO_MAX_BYTES + 64 * 1024) {
    throw new ApiError("payload_too_large", `Recordings are limited to ${Math.round(AUDIO_MAX_BYTES / 1024 / 1024)} MB.`);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("malformed_input", "Send the recording as multipart form data with an `audio` file.");
  }
  const file = form.get("audio");
  if (!(file instanceof File)) throw new ApiError("malformed_input", "Missing `audio` file field.");

  const upload = await validateAudioFile(file);
  const result = await transcriber.transcribe({ audio: upload.bytes, mimeType: upload.mimeType, signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS) });

  if (result.durationSeconds !== null && result.durationSeconds > AUDIO_MAX_SECONDS + 1) {
    throw new ApiError("malformed_input", `Recordings are limited to ${AUDIO_MAX_SECONDS} seconds.`, { retryable: false });
  }
  return json(result, { requestId });
});
