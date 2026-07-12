import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-white py-10">
      <div className="container flex flex-col justify-between gap-6 text-sm text-ink/70 md:flex-row md:items-center">
        <div>
          <p className="font-semibold text-ink">PreconFin QBO → Xero Migrator</p>
          <p className="mt-1">A standalone utility from PreconFin.</p>
        </div>
        <nav className="flex flex-wrap gap-4" aria-label="Footer navigation">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/contact" className="hover:text-ink">Contact</Link>
          <Link href="https://www.preconfin.com" className="hover:text-ink">PreconFin</Link>
        </nav>
      </div>
    </footer>
  );
}
