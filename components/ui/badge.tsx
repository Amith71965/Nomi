import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  accent: "bg-accent-soft text-accent border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] leading-4",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
