"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Recorder } from "@/components/assistant/recorder";
import { Button } from "@/components/ui/button";
import { INPUT_TEXT_MAX } from "@/lib/schemas/common";

export interface ComposerHandle {
  /** Drop text into the box (an example or a transcript) for the user to edit and send. */
  insert(text: string, kind: "text" | "voice"): void;
}

export const Composer = forwardRef<
  ComposerHandle,
  {
    disabled: boolean;
    voiceEnabled: boolean;
    onSend: (text: string, inputKind: "text" | "voice") => void;
  }
>(function Composer({ disabled, voiceEnabled, onSend }, handle) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"text" | "voice">("text");
  const ref = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(handle, () => ({
    insert(next, nextKind) {
      setText(next);
      setKind(nextKind);
      ref.current?.focus();
    },
  }));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0 || disabled) return;
    onSend(trimmed, kind);
    setText("");
    setKind("text");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className="rounded-card border border-border-strong bg-surface p-2 shadow-soft">
      <label htmlFor="composer" className="sr-only">
        Message Nomi
      </label>
      <textarea
        id="composer"
        ref={ref}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (kind === "voice" && e.target.value.trim().length === 0) setKind("text");
        }}
        onKeyDown={onKeyDown}
        rows={1}
        maxLength={INPUT_TEXT_MAX}
        placeholder="Tell Nomi what ran out, what you're cooking, or ask what to buy…"
        className="block w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted"
        disabled={disabled}
      />
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <div className="flex items-center gap-2 text-xs text-muted">
          {voiceEnabled && <Recorder disabled={disabled} onTranscript={(t) => { setText(t); setKind("voice"); ref.current?.focus(); }} />}
          {kind === "voice" && <span>Transcript · edit before sending</span>}
          {kind !== "voice" && <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>}
        </div>
        <Button type="submit" size="sm" disabled={disabled || text.trim().length === 0}>
          Send
        </Button>
      </div>
    </form>
  );
});
