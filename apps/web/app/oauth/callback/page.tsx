import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "QuickBooks Connected",
  description: "QuickBooks Online connection returned to the migrator.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OAuthCallbackPage() {
  return (
    <main className="py-20">
      <div className="container max-w-2xl text-center">
        <h1 className="text-4xl font-semibold text-ink">
          QuickBooks connection returned.
        </h1>
        <p className="mt-5 text-lg leading-8 text-ink/72">
          If the migration wizard did not open automatically, continue there to
          run your scan.
        </p>
        <Link
          href="/migrate"
          className="mt-8 inline-flex min-h-12 items-center rounded-full bg-teal px-6 text-sm font-semibold text-white"
        >
          Continue to migration wizard
        </Link>
      </div>
    </main>
  );
}
