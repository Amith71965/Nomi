import { Wordmark } from "@/components/landing/nav";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-4">
          <Wordmark className="text-xl" />
          <span className="text-sm text-muted">Private preview</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
          <a href="https://github.com/Amith71965/Nomi" target="_blank" rel="noopener noreferrer" className="hover:text-text">
            Source on GitHub
          </a>
          <span className="font-mono text-xs">Nothing on this page creates a real event.</span>
        </div>
      </div>
    </footer>
  );
}
