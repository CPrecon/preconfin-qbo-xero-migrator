import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers about QuickBooks Online access, Xero CSV files, validation reports, and privacy.",
};

const faqs = [
  [
    "Does this write to QuickBooks or Xero?",
    "No. Version 1 is read-only for QuickBooks and generates files for Xero import. It does not write to either system.",
  ],
  [
    "Do I need a PreconFin account?",
    "No. You can run a scan without a PreconFin account.",
  ],
  [
    "What do I receive?",
    "A ZIP package with CSV files, mapping report, exceptions, README, assessment JSON, and a branded PreconFin Financial Assessment PDF.",
  ],
  [
    "Is this a replacement for an accountant?",
    "No. It gives you a structured migration package and readiness report. You should still review the output before importing into Xero.",
  ],
  [
    "How is data protected?",
    "OAuth tokens are encrypted, artifacts are private, and downloads use expiring signed URLs.",
  ],
];

export default function FaqPage() {
  return (
    <main className="py-20">
      <div className="container max-w-3xl">
        <h1 className="text-4xl font-semibold text-ink">FAQ</h1>
        <div className="mt-10 divide-y divide-ink/10 rounded-lg border border-ink/10 bg-white">
          {faqs.map(([question, answer]) => (
            <section key={question} className="p-6">
              <h2 className="text-lg font-semibold text-ink">{question}</h2>
              <p className="mt-3 leading-7 text-ink/70">{answer}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
