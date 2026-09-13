"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ClientApiError } from "@/lib/api-client";
import { AUDIO_MAX_SECONDS } from "@/lib/audio";

type Phase = { kind: "idle" } | { kind: "recording"; seconds: number } | { kind: "transcribing" } | { kind: "error"; message: string };

/**
 * Push-to-talk. Records in the browser, sends the clip once to /api/transcribe,
 * and hands the text back for the user to edit and send. The audio is never
 * stored; the transcript is not a message until Send is pressed.
 */
export function Recorder({ disabled, onTranscript }: { disabled: boolean; onTranscript: (text: string) => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => stopTimer(), []);

  function stopTimer() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }

  async function start() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      setPhase({ kind: "error", message: "This browser cannot record audio. Type your message instead." });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase({ kind: "error", message: "Microphone access was denied. Type your message instead." });
      return;
    }
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    cancelled.current = false;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      stopTimer();
      if (cancelled.current) {
        setPhase({ kind: "idle" });
        return;
      }
      const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
      setPhase({ kind: "transcribing" });
      try {
        const result = await api.transcribe(blob, blob.type || "audio/webm");
        if (result.text.trim().length === 0) {
          setPhase({ kind: "error", message: "Nothing was heard. Try again closer to the microphone." });
          return;
        }
        onTranscript(result.text);
        setPhase({ kind: "idle" });
      } catch (e) {
        setPhase({ kind: "error", message: e instanceof ClientApiError ? e.message : "Transcription failed. Type your message instead." });
      }
    };
    recorder.current = rec;
    rec.start();
    let seconds = 0;
    setPhase({ kind: "recording", seconds });
    timer.current = setInterval(() => {
      seconds += 1;
      setPhase({ kind: "recording", seconds });
      if (seconds >= AUDIO_MAX_SECONDS) stop();
    }, 1000);
  }

  function stop() {
    recorder.current?.stop();
    recorder.current = null;
  }

  function cancel() {
    cancelled.current = true;
    stop();
  }

  if (phase.kind === "recording") {
    return (
      <span className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-danger">
          <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-danger" />
          {phase.seconds}s / {AUDIO_MAX_SECONDS}s
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={stop}>
          Stop
        </Button>
        <Button type="button" variant="quiet" size="sm" onClick={cancel}>
          Cancel
        </Button>
      </span>
    );
  }
  if (phase.kind === "transcribing") return <span className="text-xs text-muted">Transcribing…</span>;
  return (
    <span className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={start} disabled={disabled} aria-label="Push to talk">
        🎙 Talk
      </Button>
      {phase.kind === "error" && (
        <span role="alert" className="text-xs text-danger">
          {phase.message}
        </span>
      )}
    </span>
  );
}
