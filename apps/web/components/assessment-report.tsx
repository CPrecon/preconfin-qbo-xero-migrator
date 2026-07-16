"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Download,
  Mail,
  XCircle,
} from "lucide-react";
import type {
  PublicMappingGroup,
  PublicMigrationAssessment,
} from "@preconfin/financial-assessment-engine";
import { supportUrl } from "../lib/config";
import { withAttribution } from "../lib/attribution";
import { track } from "../lib/analytics";

const mappingGroupOrder: readonly PublicMappingGroup[] = [
  "System Accounts",
  "Tax",
  "Credit Cards",
  "Tracking",
  "Accounts",
  "Other",
];

function controlIcon(
  status: PublicMigrationAssessment["controls"][number]["status"],
) {
  if (status === "passed") {
    return <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-teal" />;
  }
  if (status === "failed") {
    return <XCircle aria-hidden="true" className="h-5 w-5 text-red-700" />;
  }
  if (status === "warning") {
    return (
      <AlertTriangle aria-hidden="true" className="h-5 w-5 text-amber-700" />
    );
  }
  return <CircleHelp aria-hidden="true" className="h-5 w-5 text-ink/45" />;
}

function controlTone(
  status: PublicMigrationAssessment["controls"][number]["status"],
): string {
  if (status === "passed") return "bg-[#e9f5f3] text-teal";
  if (status === "failed") return "bg-red-50 text-red-800";
  if (status === "warning") return "bg-amber-50 text-amber-800";
  return "bg-ink/5 text-ink/60";
}

function readinessTone(
  state: PublicMigrationAssessment["readiness"]["state"],
): string {
  if (state === "blocked") return "border-red-200 bg-red-50 text-red-800";
  if (state === "needs_attention") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-teal/20 bg-[#e9f5f3] text-teal";
}

function fixLocation(value: string): string {
  if (value === "quickbooks") return "QuickBooks";
  if (value === "xero") return "Xero";
  if (value === "preconfin") return "PreconFin";
  if (value === "accountant") return "Accountant";
  if (value === "source_system") return "Source system";
  return "Review only";
}

export function AssessmentReport({
  report,
  reportDownloadUrl,
  onRequestReport,
}: {
  report: PublicMigrationAssessment;
  reportDownloadUrl?: string;
  onRequestReport?: (action: "download" | "email") => void;
}) {
  const [consultationHref, setConsultationHref] = useState(supportUrl);
  const reviewMappings = report.mappingReview.mappings.filter(
    (mapping) => mapping.reviewStatus === "requires_review",
  );
  const automaticMappings = report.mappingReview.mappings.filter(
    (mapping) => mapping.reviewStatus === "automatically_accepted",
  );
  const groupedMappings = mappingGroupOrder
    .map((group) => ({
      group,
      mappings: reviewMappings.filter((mapping) => mapping.group === group),
    }))
    .filter((item) => item.mappings.length > 0);
  const emailHref = reportDownloadUrl
    ? `mailto:?subject=${encodeURIComponent("PreconFin Financial Assessment")}&body=${encodeURIComponent(
        `PreconFin Financial Assessment\n\nDownload the report: ${reportDownloadUrl}\n\nThis secure link may expire.`,
      )}`
    : undefined;

  useEffect(() => {
    setConsultationHref(
      withAttribution(supportUrl, "qbo_xero_financial_assessment"),
    );
  }, []);

  function requestReport(action: "download" | "email") {
    track("preconfin_cta_clicked", {
      source: `financial_assessment_${action}`,
    });
    onRequestReport?.(action);
  }

  return (
    <section
      aria-labelledby="assessment-heading"
      className="min-w-0 lg:col-span-2"
    >
      <div className="border-y border-ink/10 bg-white px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase text-teal">
              PreconFin Financial Assessment
            </p>
            <h2
              id="assessment-heading"
              className="mt-2 text-3xl font-semibold leading-tight text-ink sm:text-4xl"
            >
              Migration Readiness for Xero
            </h2>
          </div>
          <div
            className={`w-fit shrink-0 rounded-md border px-4 py-3 ${readinessTone(
              report.readiness.state,
            )}`}
          >
            <p className="text-xs font-semibold uppercase">Overall status</p>
            <p className="mt-1 text-xl font-semibold">
              {report.readiness.label}
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-px overflow-hidden rounded-md border border-ink/10 bg-ink/10 sm:grid-cols-3">
          {[
            {
              label: "Financial Health",
              value: `${report.scores.financialHealth}/100`,
              detail: "Accounting quality",
            },
            {
              label: "Migration Readiness",
              value: `${report.scores.migrationReadiness}/100`,
              detail: "Migration work remaining",
            },
            {
              label: "Manual Review Required",
              value: String(report.scores.manualReviewRequired),
              detail: "Decisions requiring judgement",
            },
          ].map((item) => (
            <div key={item.label} className="min-w-0 bg-paper p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase text-ink/50">
                {item.label}
              </p>
              <p className="mt-2 text-3xl font-semibold text-ink">
                {item.value}
              </p>
              <p className="mt-1 text-sm text-ink/55">{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 max-w-3xl border-l-2 border-teal pl-5">
          <h3 className="text-sm font-semibold uppercase text-ink/50">
            Executive summary
          </h3>
          <p className="mt-2 text-lg leading-8 text-ink/78">
            {report.executiveSummary}
          </p>
        </div>
      </div>

      <div className="py-10 lg:py-12">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-teal">
              Financial health
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-ink">
              Financial controls
            </h3>
          </div>
          <p className="max-w-xl text-sm leading-6 text-ink/60 sm:text-right">
            Deterministic checks compare source records and financial reports.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {report.controls.map((control) => (
            <article
              key={control.title}
              className="min-w-0 rounded-md border border-ink/10 bg-white p-5 shadow-sm"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 shrink-0">
                  {controlIcon(control.status)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h4 className="font-semibold text-ink">{control.title}</h4>
                    <span
                      className={`rounded-sm px-2 py-1 text-xs font-semibold ${controlTone(
                        control.status,
                      )}`}
                    >
                      {control.statusLabel}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-ink/70">
                    <span className="font-semibold text-ink/75">
                      Why this status:{" "}
                    </span>
                    {control.explanation}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-ink/60">
                    <span className="font-semibold text-ink/75">
                      Business impact:{" "}
                    </span>
                    {control.businessImpact}
                  </p>
                  <details className="mt-4 border-t border-ink/10 pt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-teal focus:outline-none focus:ring-2 focus:ring-teal">
                      View evidence
                    </summary>
                    <p className="mt-2 text-sm leading-6 text-ink/60">
                      {control.evidence}
                    </p>
                  </details>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="border-y border-ink/10 bg-white px-5 py-10 sm:px-8 lg:px-10 lg:py-12">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase text-teal">
            Action required
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">
            What needs attention
          </h3>
          <p className="mt-3 leading-7 text-ink/65">
            Actions are ordered by financial importance and migration
            dependency.
          </p>
        </div>
        {report.recommendations.length ? (
          <ol className="mt-7 grid gap-4 lg:grid-cols-2">
            {report.recommendations.map((recommendation) => (
              <li
                key={`${recommendation.title}-${recommendation.fixLocation}`}
                className="min-w-0 rounded-md border border-ink/10 bg-paper p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase text-teal">
                    Priority {recommendation.priority}
                  </p>
                  <p className="text-xs font-semibold text-ink/55">
                    Expected time · {recommendation.expectedCompletionTime}
                  </p>
                </div>
                <h4 className="mt-3 text-lg font-semibold text-ink">
                  {recommendation.title}
                </h4>
                <dl className="mt-4 space-y-3 text-sm leading-6">
                  <div>
                    <dt className="font-semibold text-ink">Business impact</dt>
                    <dd className="text-ink/65">
                      {recommendation.businessImpact}
                    </dd>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-ink">Effort</dt>
                      <dd className="text-ink/65">
                        {recommendation.estimatedEffort}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-ink">Where to fix</dt>
                      <dd className="text-ink/65">
                        {fixLocation(recommendation.fixLocation)}
                      </dd>
                    </div>
                  </div>
                </dl>
                <div className="mt-5 border-t border-ink/10 pt-4">
                  <p className="text-xs font-semibold uppercase text-ink/45">
                    Primary action
                  </p>
                  <p className="mt-1 text-sm leading-6 text-ink/75">
                    {recommendation.action}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-6 border-l-2 border-teal pl-4">
            <p className="leading-7 text-ink/70">
              {report.summary.primaryRecommendation}
            </p>
          </div>
        )}
      </div>

      <div className="py-10 lg:py-12">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase text-teal">
            Migration readiness
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">
            Mapping review
          </h3>
          <p className="mt-3 leading-7 text-ink/65">
            Routine mappings are accepted automatically. Only decisions that
            require judgement appear for review.
          </p>
        </div>

        <dl className="mt-6 grid gap-px overflow-hidden rounded-md border border-ink/10 bg-ink/10 sm:grid-cols-3">
          <div className="min-w-0 bg-white p-5">
            <dt className="text-sm text-ink/60">Automatically mapped</dt>
            <dd className="mt-1 text-2xl font-semibold text-ink">
              {report.mappingReview.automaticallyAccepted}
            </dd>
          </div>
          <div className="min-w-0 bg-white p-5">
            <dt className="text-sm text-ink/60">Needs confirmation</dt>
            <dd className="mt-1 text-2xl font-semibold text-ink">
              {report.mappingReview.requiresReview}
            </dd>
          </div>
          <div className="min-w-0 bg-white p-5">
            <dt className="text-sm text-ink/60">Excluded because unused</dt>
            <dd className="mt-1 text-2xl font-semibold text-ink">
              {report.mappingReview.excludedUnused}
            </dd>
          </div>
        </dl>

        {automaticMappings.length > 0 && (
          <details className="mt-5 rounded-md border border-ink/10 bg-white">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-teal">
              <span>
                Automatic mappings
                <span className="ml-2 font-normal text-ink/55">
                  {automaticMappings.length} confirmed
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 text-teal" />
            </summary>
            <ul className="grid gap-px border-t border-ink/10 bg-ink/10 sm:grid-cols-2">
              {automaticMappings.map((mapping, index) => (
                <li
                  key={`${mapping.title}-${mapping.proposedTreatment}-${index}`}
                  className="min-w-0 bg-paper px-5 py-3"
                >
                  <p className="truncate text-sm font-semibold text-ink">
                    {mapping.title}
                  </p>
                  <p className="mt-1 truncate text-xs text-ink/55">
                    {mapping.proposedTreatment}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}

        {groupedMappings.length > 0 ? (
          <div className="mt-6 space-y-3">
            {groupedMappings.map(({ group, mappings }, groupIndex) => (
              <details
                key={group}
                open={groupIndex === 0}
                className="rounded-md border border-ink/10 bg-white"
              >
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-teal">
                  <span>{group}</span>
                  <span className="text-sm font-normal text-ink/55">
                    {mappings.length} decision
                    {mappings.length === 1 ? "" : "s"}
                  </span>
                </summary>
                <div className="divide-y divide-ink/10 border-t border-ink/10">
                  {mappings.map((mapping, index) => (
                    <article
                      key={`${mapping.title}-${mapping.proposedTreatment}-${index}`}
                      className="min-w-0 px-5 py-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h4 className="font-semibold text-ink">
                          {mapping.title}
                        </h4>
                        <span className="rounded-sm bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                          {mapping.confidenceClassification}
                        </span>
                      </div>
                      <dl className="mt-4 grid gap-4 text-sm leading-6 lg:grid-cols-3">
                        <div>
                          <dt className="font-semibold text-ink">
                            Proposed treatment
                          </dt>
                          <dd className="text-ink/65">
                            {mapping.proposedTreatment}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-ink">
                            Business reason
                          </dt>
                          <dd className="text-ink/65">
                            {mapping.businessReason}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-ink">
                            Required action
                          </dt>
                          <dd className="text-ink/65">
                            {mapping.requiredAction}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="mt-5 border-l-2 border-teal pl-4 text-sm leading-6 text-ink/70">
            No manual mapping decisions remain.
          </p>
        )}
      </div>

      <div className="border-y border-ink/10 bg-white px-5 py-10 sm:px-8 lg:px-10 lg:py-12">
        <p className="text-sm font-semibold uppercase text-teal">
          Migration plan
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">
          Recommended sequence
        </h3>
        <ol className="mt-7 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {report.nextSteps.map((step) => (
            <li key={step.title} className="flex min-w-0 gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-teal/25 bg-[#e9f5f3] text-sm font-semibold text-teal">
                {step.sequence}
              </span>
              <div className="min-w-0">
                <h4 className="font-semibold text-ink">{step.title}</h4>
                <p className="mt-1 text-sm leading-6 text-ink/60">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {report.supportRecommended && (
        <div className="mt-8 border-l-2 border-amber-600 pl-4">
          <p className="text-sm leading-6 text-ink/70">
            A deterministic product limitation requires PreconFin review before
            the migration can be completed.
          </p>
        </div>
      )}

      <div className="mt-10 bg-ink px-5 py-8 text-white sm:px-8 lg:px-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h3 className="text-2xl font-semibold">
              Need help interpreting this assessment?
            </h3>
            <p className="mt-2 leading-7 text-white/70">
              Book a free migration review with PreconFin.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href={consultationHref}
              onClick={() =>
                track("preconfin_cta_clicked", {
                  source: "financial_assessment_consultation",
                })
              }
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-ink hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-ink"
            >
              Book Consultation
            </a>
            {reportDownloadUrl ? (
              <a
                href={reportDownloadUrl}
                onClick={() => requestReport("download")}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 px-5 text-sm font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <Download aria-hidden="true" className="mr-2 h-4 w-4" />
                Download Report
              </a>
            ) : (
              <button
                type="button"
                onClick={() => requestReport("download")}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 px-5 text-sm font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <Download aria-hidden="true" className="mr-2 h-4 w-4" />
                Download Report
              </button>
            )}
            {emailHref ? (
              <a
                href={emailHref}
                onClick={() => requestReport("email")}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 px-5 text-sm font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <Mail aria-hidden="true" className="mr-2 h-4 w-4" />
                Email Report
              </a>
            ) : (
              <button
                type="button"
                onClick={() => requestReport("email")}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 px-5 text-sm font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <Mail aria-hidden="true" className="mr-2 h-4 w-4" />
                Email Report
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
