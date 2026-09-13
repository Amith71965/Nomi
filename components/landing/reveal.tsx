"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Scroll reveal that can never hide content from someone without JavaScript
 * or before hydration: the server HTML is fully visible. Only after mount,
 * and only for elements below the fold, is the element "armed" (hidden) and
 * then shown when reached. The observer root extends far above the viewport
 * so content scrolled past quickly is still marked visible.
 */
export function Reveal({ children, className, index = 0 }: { children: ReactNode; className?: string; index?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already in view: leave it visible, no animation.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    el.classList.add("reveal-armed");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add("is-visible");
          io.disconnect();
        }
      },
      { rootMargin: "100000px 0px -10% 0px", threshold: 0 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.classList.remove("reveal-armed");
    };
  }, []);

  return (
    <div ref={ref} className={cn("reveal", className)} style={{ "--i": index } as CSSProperties}>
      {children}
    </div>
  );
}
