"use client";

import { AlertTriangle, CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import type { PublicMigrationAssessment } from "@preconfin/financial-assessment-engine";
import { supportUrl } from "../lib/config";
import { withAttribution } from "../lib/attribution";
import { track } from "../lib/analytics";

function controlIcon(
  status: PublicMigrationAssessment["controls"][number]["status"],
) {
  if (status === "passed") {
    return <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-teal" />;
  }
  if (status === "failed") {
    return <XCircle aria-hidden="true" className="h-4 w-4 text-red-700" />;
  }
  if (status === "warning") {
    return (
      <AlertTriangle aria-hidden="true" className="h-4 w-4 text-amber-700" />
    );
  }
  return <CircleHelp aria-hidden="true" className="h-4 w-4 text-ink/45" />;
}

function controlStatus(status: string): string {
  if (status === "not_applicable") return "Not applicable";
  if (status === "unavailable") return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
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
}: {
  report: PublicMigrationAssessment;
}) {
  const reviewMappings = report.mappingReview.mappings.filter(
    (mapping) => mapping.reviewStatus === "requires_review",
  );
  const automaticMappings = report.mappingReview.mappings.filter(
    (mapping) => mapping.reviewStatus === "automatically_accepted",
  );
  const nextSteps = report.nextSteps.filter((step) =>
    [
      "Review mappings",
      "Generate the migration package",
      "Import into a Xero demo organisation",
      "Verify destination balances",
    ].includes(step.title),
  );

  return (
    <section
      aria-labelledby="assessment-heading"
      className="min-w-0 rounded-lg border border-ink/10 bg-white p-6 shadow-sm lg:col-span-2 lg:p-8"
    >
      <div className="flex flex-col gap-4 border-b border-ink/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal">
            PreconFin Financial Assessment
          </p>
          <h2
            id="assessment-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-ink"
          >
            Migration Readiness for Xero
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">
            {report.readiness.explanation}
          </p>
        </div>
        <div className="shrink-0">
          <p className="text-xs font-semibold uppercase text-ink/50">
            Overall status
          </p>
          <p className="mt-1 text-xl font-semibold text-ink">
            {report.readiness.label}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Financial Health",
            value: `${report.scores.financialHealth}/100`,
            detail: "Deterministic financial controls",
          },
          {
            label: "Migration Readiness",
            value: `${report.scores.migrationReadiness}/100`,
            detail: "Applicable migration work",
          },
          {
            label: "Manual Review Required",
            value: String(report.scores.manualReviewRequired),
            detail: "Mapping decisions, not accounting errors",
          },
        ].map((item) => (
          <div key={item.label} className="min-w-0 border-l-2 border-teal pl-4">
            <p className="text-xs font-semibold uppercase text-ink/50">
              {item.label}
            </p>
            <p className="mt-1 text-2xl font-semibold text-ink">{item.value}</p>
            <p className="mt-1 text-xs leading-5 text-ink/55">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 border-t border-ink/10 pt-7">
        <h3 className="text-lg font-semibold text-ink">Financial controls</h3>
        <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
          {report.controls.map((control) => (
            <div
              key={control.title}
              className="flex min-w-0 items-start gap-3 border-b border-ink/8 pb-4"
            >
              <span className="mt-0.5 shrink-0">
                {controlIcon(control.status)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-ink">{control.title}</p>
                  <p className="text-xs font-semibold text-ink/55">
                    {controlStatus(control.status)}
                  </p>
                </div>
                <p className="mt-1 text-sm leading-6 text-ink/65">
                  {control.explanation}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-8 border-t border-ink/10 pt-7 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink">
            Prioritized recommendations
          </h3>
          {report.recommendations.length ? (
            <ol className="mt-4 space-y-4">
              {report.recommendations.map((recommendation) => (
                <li
                  key={`${recommendation.priority}-${recommendation.title}`}
                  className="min-w-0 border-l-2 border-ink/15 pl-4"
                >
                  <p className="text-xs font-semibold uppercase text-teal">
                    Priority {recommendation.priority}
                  </p>
                  <p className="mt-1 font-semibold text-ink">
                    {recommendation.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-ink/65">
                    {recommendation.action}
                  </p>
                  <dl className="mt-2 grid gap-1 text-xs text-ink/55">
                    <div>
                      <dt className="inline font-semibold">
                        Business impact:{" "}
                      </dt>
                      <dd className="inline">
                        {recommendation.businessImpact}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold">Effort: </dt>
                      <dd className="inline">
                        {recommendation.estimatedEffort},{" "}
                        {recommendation.expectedCompletionTime}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold">Where: </dt>
                      <dd className="inline">
                        {fixLocation(recommendation.fixLocation)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm leading-6 text-ink/65">
              {report.summary.primaryRecommendation}
            </p>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink">Mapping review</h3>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="min-w-0 bg-paper p-3">
              <dt className="text-xs leading-4 text-ink/55">
                Automatically accepted
              </dt>
              <dd className="mt-1 text-xl font-semibold">
                {report.mappingReview.automaticallyAccepted}
              </dd>
            </div>
            <div className="min-w-0 bg-paper p-3">
              <dt className="text-xs leading-4 text-ink/55">Needs review</dt>
              <dd className="mt-1 text-xl font-semibold">
                {report.mappingReview.requiresReview}
              </dd>
            </div>
            <div className="min-w-0 bg-paper p-3">
              <dt className="text-xs leading-4 text-ink/55">Excluded unused</dt>
              <dd className="mt-1 text-xl font-semibold">
                {report.mappingReview.excludedUnused}
              </dd>
            </div>
          </dl>

          {reviewMappings.length > 0 && (
            <details className="mt-4 border-t border-ink/10 pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-teal focus:outline-none focus:ring-2 focus:ring-teal">
                Review {reviewMappings.length} mapping
                {reviewMappings.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-4 space-y-4">
                {reviewMappings.map((mapping, index) => (
                  <div
                    key={`${mapping.title}-${index}`}
                    className="border-l-2 border-amber-600 pl-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold text-ink">{mapping.title}</p>
                      <p className="text-xs font-semibold text-ink/55">
                        {mapping.confidencePercentage}% confidence
                      </p>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-ink/55">
                      Proposed treatment: {mapping.target}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-ink/65">
                      {mapping.reason}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-amber-800">
                      Requires review
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {automaticMappings.length > 0 && (
            <details className="mt-4 border-t border-ink/10 pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink/65 focus:outline-none focus:ring-2 focus:ring-teal">
                View {automaticMappings.length} automatically accepted mapping
                {automaticMappings.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-4 space-y-4">
                {automaticMappings.map((mapping, index) => (
                  <div
                    key={`${mapping.title}-${index}`}
                    className="border-l-2 border-teal pl-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold text-ink">{mapping.title}</p>
                      <p className="text-xs font-semibold text-ink/55">
                        {mapping.confidencePercentage}% confidence
                      </p>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-ink/55">
                      Mapped to: {mapping.target}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-ink/65">
                      {mapping.reason}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-teal">
                      Automatically accepted
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      <div className="mt-8 border-t border-ink/10 pt-7">
        <h3 className="text-lg font-semibold text-ink">Next steps</h3>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {nextSteps.map((step, index) => (
            <li key={step.title} className="min-w-0">
              <p className="text-xs font-semibold uppercase text-teal">
                Step {index + 1}
              </p>
              <p className="mt-1 font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-sm leading-6 text-ink/65">
                {step.description}
              </p>
            </li>
          ))}
        </ol>

        {report.supportRecommended && (
          <div className="mt-6 border-l-2 border-teal pl-4">
            <p className="text-sm leading-6 text-ink/70">
              A deterministic issue requires PreconFin support before it can be
              resolved.
            </p>
            <a
              href={withAttribution(supportUrl, "qbo_xero_migrator_assessment")}
              onClick={() =>
                track("preconfin_cta_clicked", {
                  source: "migration_assessment_unresolved_issue",
                })
              }
              className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-teal"
            >
              Contact PreconFin
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
