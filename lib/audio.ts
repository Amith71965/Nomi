import { ApiError } from "@/lib/errors";

/** Upload limits for push-to-talk recordings (plan: ≤ 3 MB, ≤ 30 s). */
export const AUDIO_MAX_BYTES = 3 * 1024 * 1024;
export const AUDIO_MAX_SECONDS = 30;

/** MIME types browsers produce with MediaRecorder, plus common file uploads for testing. */
export const AUDIO_ALLOWED_TYPES: ReadonlySet<string> = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "video/webm", // some browsers label audio-only WebM this way
]);

/** "audio/webm;codecs=opus" → "audio/webm" */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isAllowedAudioType(mimeType: string): boolean {
  return AUDIO_ALLOWED_TYPES.has(baseMimeType(mimeType));
}

export interface AudioUpload {
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
  size: number;
}

/** Validate size and type before any provider call. Throws 413 / 400. */
export async function validateAudioFile(file: File): Promise<AudioUpload> {
  if (file.size === 0) throw new ApiError("malformed_input", "The recording is empty.");
  if (file.size > AUDIO_MAX_BYTES) {
    throw new ApiError("payload_too_large", `Recordings are limited to ${Math.round(AUDIO_MAX_BYTES / 1024 / 1024)} MB.`);
  }
  if (!isAllowedAudioType(file.type)) {
    throw new ApiError("malformed_input", "Unsupported audio format.", { details: { type: file.type || "(none)" } });
  }
  return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type, size: file.size };
}
