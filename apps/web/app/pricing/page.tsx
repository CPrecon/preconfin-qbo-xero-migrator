import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start with a free PreconFin Financial Assessment and choose assisted migration support only when needed.",
};

export default function PricingPage() {
  return (
    <main className="py-20">
      <div className="container max-w-4xl text-center">
        <p className="text-sm font-semibold uppercase text-teal">
          Simple starting point
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-ink">
          Start with your Financial Assessment.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-ink/72">
          Understand financial health and migration readiness before committing
          to an assisted migration project. PreconFin consultation is available
          when the assessment identifies an issue that needs expert review.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-ink/10 bg-white p-6 text-left">
            <h2 className="text-xl font-semibold">Financial Assessment</h2>
            <p className="mt-3 text-ink/70">
              Connect QuickBooks, review deterministic financial controls, and
              download the assessment and migration files.
            </p>
            <Link
              href="/migrate"
              className="mt-6 inline-flex min-h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-white"
            >
              Get free assessment
            </Link>
          </div>
          <div className="rounded-lg border border-ink/10 bg-white p-6 text-left">
            <h2 className="text-xl font-semibold">Assisted review</h2>
            <p className="mt-3 text-ink/70">
              Share your report with PreconFin to review exceptions, mappings,
              and migration risk before import.
            </p>
            <Link
              href="/contact"
              className="mt-6 inline-flex min-h-11 items-center rounded-full border border-ink/15 px-5 text-sm font-semibold text-ink"
            >
              Contact PreconFin
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
