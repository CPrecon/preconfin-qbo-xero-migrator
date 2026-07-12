import Link from "next/link";
import { ArrowRight, CheckCircle2, FileArchive, FileText, ShieldCheck } from "lucide-react";

const steps = [
  ["Connect QuickBooks", "Use Intuit OAuth with read-only accounting access."],
  ["Validate the books", "PreconFin checks balances, contacts, tax codes, journals, invoices, bills, and migration risks."],
  ["Download Xero files", "Receive CSV files, mapping reports, exceptions, README, and a branded validation PDF."]
];

const supported = ["Company", "Chart of accounts", "Customers", "Vendors", "Items", "Invoices", "Bills", "Payments", "Credit notes", "Journal entries", "Trial balance", "Profit & loss", "Balance sheet"];

export default function HomePage() {
  return (
    <main>
      <section className="border-b border-ink/10 bg-paper py-20 sm:py-28">
        <div className="container grid items-center gap-12 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal">QBO → Xero migration utility</p>
            <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-tight tracking-tight text-ink sm:text-6xl">Move from QuickBooks Online to Xero with confidence.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/72">Connect QuickBooks Online, scan your accounting data, and download a Xero-ready migration package with a professional validation report.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/migrate" className="inline-flex min-h-12 items-center justify-center rounded-full bg-teal px-6 text-sm font-semibold text-white hover:bg-[#185c60]">Start migration scan <ArrowRight className="ml-2 h-4 w-4" /></Link>
              <Link href="/features" className="inline-flex min-h-12 items-center justify-center rounded-full border border-ink/15 bg-white px-6 text-sm font-semibold text-ink hover:bg-ink/5">See what is included</Link>
            </div>
            <p className="mt-5 text-sm text-ink/60">No PreconFin account required. QuickBooks access is read-only.</p>
          </div>
          <div className="rounded-xl border border-ink/10 bg-white p-4 shadow-xl shadow-ink/5">
            <div className="rounded-lg border border-ink/10 bg-[#f8faf9] p-5">
              <div className="flex items-center justify-between border-b border-ink/10 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-teal">Migration readiness</p>
                  <h2 className="mt-1 text-2xl font-semibold text-ink">82 / 100</h2>
                </div>
                <ShieldCheck className="h-9 w-9 text-teal" />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {["Accounts mapped", "3 warnings", "0 token exposure"].map((item) => <div key={item} className="rounded-lg border border-ink/10 bg-white p-3 text-sm font-medium text-ink">{item}</div>)}
              </div>
              <div className="mt-5 space-y-3">
                {["Trial balance checked", "Duplicate contacts reviewed", "Xero CSV package generated"].map((item) => <div key={item} className="flex items-center gap-3 rounded-lg bg-white p-3 text-sm text-ink/72"><CheckCircle2 className="h-4 w-4 text-teal" />{item}</div>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-ink">How it works</h2>
            <p className="mt-4 text-lg leading-8 text-ink/70">The tool turns QuickBooks data into a clean migration package and shows what needs review before you import into Xero.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map(([title, body], index) => <div key={title} className="rounded-lg border border-ink/10 bg-white p-6 shadow-sm"><p className="text-sm font-semibold text-teal">Step {index + 1}</p><h3 className="mt-3 text-xl font-semibold text-ink">{title}</h3><p className="mt-3 leading-7 text-ink/70">{body}</p></div>)}
          </div>
        </div>
      </section>

      <section className="border-y border-ink/10 bg-white py-20">
        <div className="container grid gap-12 lg:grid-cols-[0.8fr_1fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-ink">Supported data</h2>
            <p className="mt-4 text-lg leading-8 text-ink/70">The scan reads the records that matter most for a controlled accounting migration.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {supported.map((item) => <div key={item} className="rounded-lg border border-ink/10 bg-paper p-4 text-sm font-medium text-ink">{item}</div>)}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container grid gap-6 md:grid-cols-3">
          <div className="rounded-lg border border-ink/10 bg-white p-6"><FileArchive className="h-7 w-7 text-teal" /><h3 className="mt-4 text-xl font-semibold">Complete ZIP package</h3><p className="mt-3 text-ink/70">CSV exports, mapping report, exceptions, README, and validation JSON.</p></div>
          <div className="rounded-lg border border-ink/10 bg-white p-6"><FileText className="h-7 w-7 text-teal" /><h3 className="mt-4 text-xl font-semibold">Validation PDF</h3><p className="mt-3 text-ink/70">A professional report for founders, finance teams, accountants, and migration partners.</p></div>
          <div className="rounded-lg border border-ink/10 bg-white p-6"><ShieldCheck className="h-7 w-7 text-teal" /><h3 className="mt-4 text-xl font-semibold">Read-only by design</h3><p className="mt-3 text-ink/70">The v1 tool does not write to QuickBooks or Xero. It generates migration files for review.</p></div>
        </div>
      </section>

      <section className="bg-ink py-20 text-white">
        <div className="container text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Ready to check migration readiness?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/72">Start with a secure QuickBooks scan. Leave with a clear report and a practical path to Xero.</p>
          <Link href="/migrate" className="mt-8 inline-flex min-h-12 items-center rounded-full bg-white px-6 text-sm font-semibold text-ink hover:bg-white/90">Start migration scan</Link>
        </div>
      </section>
    </main>
  );
}
