import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms", description: "Terms for using the PreconFin QBO to Xero Migrator." };

export default function TermsPage() {
  return <main className="py-20"><div className="container max-w-3xl"><h1 className="text-4xl font-semibold tracking-tight">Terms</h1><div className="mt-8 space-y-6 leading-8 text-ink/72"><p>The migrator provides export and validation tools for review. It does not guarantee that every generated file can be imported without accountant or migration specialist review.</p><p>You are responsible for reviewing migration files, validation findings, and Xero import results before relying on migrated accounting data.</p><p>The v1 product does not write to QuickBooks Online or Xero. Generated files should be tested in a demo organization before production import.</p></div></div></main>;
}
