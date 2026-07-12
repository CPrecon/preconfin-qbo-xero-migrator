import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features",
  description:
    "QuickBooks Online migration scan, validation, Xero CSV export, and branded report generation.",
};

const features = [
  [
    "Read-only QuickBooks connection",
    "Uses Intuit OAuth and accounting scopes to read migration data without writing back.",
  ],
  [
    "Canonical accounting model",
    "Normalizes accounts, contacts, items, transactions, balances, tax rates, currencies, and tracking data before export.",
  ],
  [
    "Migration health checks",
    "Detects duplicates, invalid account types, unbalanced journals, missing tax codes, date issues, AR/AP mismatches, and unsupported features.",
  ],
  [
    "Xero-ready CSV files",
    "Generates chart of accounts, contacts, invoices, bills, items, manual journals, bank statements, opening balances, mapping report, and exceptions.",
  ],
  [
    "Branded PDF report",
    "Creates a professional Migration Health Report with score, findings, recommendations, and next steps.",
  ],
  [
    "Secure downloads",
    "Stores generated artifacts privately and serves them through signed URLs.",
  ],
];

export default function FeaturesPage() {
  return (
    <main className="py-20">
      <div className="container">
        <h1 className="text-4xl font-semibold tracking-tight text-ink">
          Everything needed for a controlled first migration pass.
        </h1>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {features.map(([title, body]) => (
            <section
              key={title}
              className="rounded-lg border border-ink/10 bg-white p-6"
            >
              <h2 className="text-xl font-semibold text-ink">{title}</h2>
              <p className="mt-3 leading-7 text-ink/70">{body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
