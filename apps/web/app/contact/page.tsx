import type { Metadata } from "next";
import { LeadForm } from "../../components/lead-form";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact PreconFin about a QBO to Xero migration report or assisted review.",
};

export default function ContactPage() {
  return (
    <main className="py-20">
      <div className="container grid gap-10 lg:grid-cols-[0.8fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase text-teal">
            Migration support
          </p>
          <h1 className="mt-4 text-4xl font-semibold text-ink">
            Talk through your migration report.
          </h1>
          <p className="mt-5 text-lg leading-8 text-ink/72">
            Share your context and PreconFin can help review exceptions,
            mappings, and next steps before your Xero import.
          </p>
        </div>
        <LeadForm source="contact" />
      </div>
    </main>
  );
}
