import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#walkthrough", label: "Walkthrough" },
  { href: "#integrations", label: "Integrations" },
  { href: "#trust", label: "Trust" },
  { href: "#faq", label: "FAQ" },
];

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`font-display text-2xl tracking-tight ${className}`} aria-label="Nomi home">
      Nomi<span className="text-accent">.</span>
    </Link>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 sm:px-8">
        <Wordmark />
        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-muted transition-colors hover:text-text">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink href="/login" variant="quiet" size="sm" className="hidden sm:inline-flex">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup" size="sm">
            Create an account
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
