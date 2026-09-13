import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-border bg-surface shadow-soft", className)} {...props} />;
}

export function CardSection({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function CardDivider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}
