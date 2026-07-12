import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "View recent QBO to Xero migration scan downloads.",
};

export default function DashboardPage() {
  return (
    <main className="py-20">
      <div className="container max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight text-ink">
          Migration dashboard
        </h1>
        <p className="mt-5 text-lg leading-8 text-ink/72">
          Open the migration wizard on the same browser used for your scan to
          view status, downloads, reconnect QuickBooks, or delete the scan.
        </p>
        <Link
          href="/migrate"
          className="mt-8 inline-flex min-h-12 items-center rounded-full bg-teal px-6 text-sm font-semibold text-white"
        >
          Open migration wizard
        </Link>
      </div>
    </main>
  );
}
