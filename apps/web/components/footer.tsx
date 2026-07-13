import Link from "next/link";
import {
  marketingToolUrl,
  marketingUrl,
  privacyUrl,
  termsUrl,
} from "../lib/config";

export function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-white py-10">
      <div className="container flex flex-col justify-between gap-6 text-sm text-ink/70 md:flex-row md:items-center">
        <div>
          <p className="font-semibold text-ink">
            PreconFin QBO → Xero Migrator
          </p>
          <p className="mt-1">A PreconFin tool for migration readiness.</p>
        </div>
        <nav className="flex flex-wrap gap-4" aria-label="Footer navigation">
          <Link href={privacyUrl} className="hover:text-ink">
            Privacy
          </Link>
          <Link href={termsUrl} className="hover:text-ink">
            Terms
          </Link>
          <Link href="/contact" className="hover:text-ink">
            Contact
          </Link>
          <Link href={marketingToolUrl} className="hover:text-ink">
            Tool overview
          </Link>
          <Link href={marketingUrl} className="hover:text-ink">
            PreconFin
          </Link>
        </nav>
      </div>
    </footer>
  );
}
