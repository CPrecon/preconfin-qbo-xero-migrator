import Link from "next/link";
import { marketingToolUrl, marketingUrl } from "../lib/config";

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/95 backdrop-blur">
      <div className="container flex min-h-16 items-center justify-between gap-6">
        <div>
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-ink"
          >
            PreconFin Migrator
          </Link>
          <p className="hidden text-xs text-ink/55 sm:block">
            A PreconFin tool
          </p>
        </div>
        <nav
          className="hidden items-center gap-1 text-sm text-ink/72 md:flex"
          aria-label="Main navigation"
        >
          <Link
            className="rounded-full px-4 py-3 hover:bg-ink/5"
            href={marketingUrl}
          >
            PreconFin
          </Link>
          <Link
            className="rounded-full px-4 py-3 hover:bg-ink/5"
            href={marketingToolUrl}
          >
            Tool overview
          </Link>
          <Link
            className="rounded-full px-4 py-3 hover:bg-ink/5"
            href="/features"
          >
            Features
          </Link>
          <Link className="rounded-full px-4 py-3 hover:bg-ink/5" href="/faq">
            FAQ
          </Link>
          <Link
            className="rounded-full px-4 py-3 hover:bg-ink/5"
            href="/contact"
          >
            Contact
          </Link>
        </nav>
        <Link
          href="/migrate"
          className="inline-flex min-h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-white hover:bg-[#185c60]"
        >
          Start migration scan
        </Link>
      </div>
    </header>
  );
}
