import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Privacy practices for the PreconFin QBO to Xero Migrator.",
};

export default function PrivacyPage() {
  return (
    <main className="py-20">
      <div className="container max-w-3xl">
        <h1 className="text-4xl font-semibold">Privacy</h1>
        <div className="mt-8 space-y-6 leading-8 text-ink/72">
          <p>
            The migrator requests read-only QuickBooks Online accounting access
            so it can generate migration files and validation reports.
          </p>
          <p>
            OAuth tokens are encrypted before storage. Generated ZIP and PDF
            artifacts are stored privately and served through signed URLs.
          </p>
          <p>
            We collect contact details only when you submit them for follow-up,
            consultation, or report support.
          </p>
          <p>
            You can delete a migration scan from the dashboard. Artifact
            retention should be configured by the deployment administrator
            according to company policy.
          </p>
        </div>
      </div>
    </main>
  );
}
