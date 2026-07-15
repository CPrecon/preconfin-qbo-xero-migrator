import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import type { AccountingSnapshot } from "@preconfin/canonical-model";
import {
  toPublicMigrationAssessment,
  type FinancialAssessmentV1,
} from "@preconfin/financial-assessment-engine";
import type { MigrationPlan } from "@preconfin/migration-engine";
import type { ValidationReport } from "@preconfin/validation-engine";

export interface PdfReportInput {
  snapshot: AccountingSnapshot;
  plan: MigrationPlan;
  validation: ValidationReport;
  assessment?: FinancialAssessmentV1;
}

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    doc.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function section(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown(1.2).fontSize(15).fillColor("#16202a").text(title).moveDown(0.4);
}

function keyValue(
  doc: PDFKit.PDFDocument,
  key: string,
  value: string | number,
): void {
  doc
    .fontSize(10)
    .fillColor("#5a6673")
    .text(key, { continued: true })
    .fillColor("#16202a")
    .text(`  ${value}`);
}

function displayLocation(value: string): string {
  if (value === "quickbooks") return "QuickBooks";
  if (value === "xero") return "Xero";
  if (value === "preconfin") return "PreconFin";
  if (value === "accountant") return "Accountant";
  if (value === "source_system") return "Source system";
  return "Review only";
}

export async function generateFinancialAssessmentPdf(
  assessment: FinancialAssessmentV1,
): Promise<Buffer> {
  const report = toPublicMigrationAssessment(assessment);
  const doc = new PDFDocument({
    size: "LETTER",
    margin: 56,
    info: {
      Title: "PreconFin Financial Assessment",
      Author: "PreconFin",
    },
  });
  const done = collect(doc);

  doc.rect(0, 0, 612, 104).fill("#16202a");
  doc
    .fillColor("#ffffff")
    .fontSize(23)
    .text("PreconFin Financial Assessment", 56, 32);
  doc
    .fontSize(10)
    .fillColor("#c9d7d3")
    .text("Migration Readiness for Xero", 56, 66);

  doc
    .fillColor("#16202a")
    .fontSize(22)
    .text(assessment.organization.displayName, 56, 132);
  doc
    .fontSize(10)
    .fillColor("#5a6673")
    .text(
      `${assessment.period.endDate} | ${assessment.basis} basis | ${assessment.currency}`,
    );

  section(doc, "Executive Summary");
  keyValue(doc, "Overall status", report.readiness.label);
  keyValue(doc, "Financial Health", `${report.scores.financialHealth}/100`);
  keyValue(
    doc,
    "Migration Readiness",
    `${report.scores.migrationReadiness}/100`,
  );
  keyValue(doc, "Manual Review Required", report.scores.manualReviewRequired);
  doc
    .moveDown(0.4)
    .fontSize(10)
    .fillColor("#16202a")
    .text(report.readiness.explanation, { lineGap: 3 });

  section(doc, "Financial Controls");
  for (const control of report.controls) {
    doc
      .fontSize(10)
      .fillColor(
        control.status === "failed"
          ? "#a32929"
          : control.status === "warning" || control.status === "unavailable"
            ? "#946200"
            : "#185c60",
      )
      .text(
        `${control.status.replace("_", " ").toUpperCase()}  ${control.title}`,
      );
    doc
      .fontSize(9)
      .fillColor("#5a6673")
      .text(control.explanation, { indent: 12, lineGap: 3 });
  }

  section(doc, "Action Required");
  if (!assessment.findings.length) {
    doc
      .fontSize(10)
      .fillColor("#16202a")
      .text("No source-data actions were identified.");
  }
  for (const finding of assessment.findings.slice(0, 12)) {
    doc.fontSize(10).fillColor("#16202a").text(finding.title, { lineGap: 2 });
    doc
      .fontSize(9)
      .fillColor("#5a6673")
      .text(`Why it matters: ${finding.businessImpact}`, {
        indent: 12,
        lineGap: 2,
      });
    doc.text(`How to fix: ${finding.recommendedAction}`, {
      indent: 12,
      lineGap: 2,
    });
    doc.text(
      `Where: ${displayLocation(finding.fixLocation)} | Effort: ${finding.estimatedEffort}`,
      { indent: 12, lineGap: 4 },
    );
  }

  section(doc, "Mapping Review");
  keyValue(
    doc,
    "Automatically accepted",
    report.mappingReview.automaticallyAccepted,
  );
  keyValue(doc, "Requires review", report.mappingReview.requiresReview);
  keyValue(doc, "Excluded because unused", report.mappingReview.excludedUnused);
  const reviewMappings = report.mappingReview.mappings.filter(
    (mapping) => mapping.reviewStatus === "requires_review",
  );
  if (!reviewMappings.length) {
    doc
      .fontSize(10)
      .fillColor("#16202a")
      .text("No manual mapping decisions remain.");
  }
  for (const mapping of reviewMappings.slice(0, 15)) {
    doc.fontSize(10).fillColor("#16202a").text(mapping.title, { lineGap: 2 });
    doc
      .fontSize(9)
      .fillColor("#5a6673")
      .text(
        `Confidence: ${mapping.confidencePercentage}% | Status: Requires review`,
        { indent: 12, lineGap: 2 },
      );
    doc.text(`Proposed treatment: ${mapping.target}`, {
      indent: 12,
      lineGap: 2,
    });
    doc.text(`Reason: ${mapping.reason}`, {
      indent: 12,
      lineGap: 4,
    });
  }

  section(doc, "Prioritized Recommendations");
  if (!report.recommendations.length) {
    doc
      .fontSize(10)
      .fillColor("#16202a")
      .text(report.summary.primaryRecommendation);
  }
  for (const recommendation of report.recommendations.slice(0, 12)) {
    doc
      .fontSize(10)
      .fillColor("#16202a")
      .text(`Priority ${recommendation.priority}: ${recommendation.title}`, {
        lineGap: 2,
      });
    doc
      .fontSize(9)
      .fillColor("#5a6673")
      .text(
        `Estimated effort: ${recommendation.estimatedEffort} | Expected time: ${recommendation.expectedCompletionTime}`,
        { indent: 12, lineGap: 2 },
      );
    doc.text(`Business impact: ${recommendation.businessImpact}`, {
      indent: 12,
      lineGap: 2,
    });
    doc.text(`Action: ${recommendation.action}`, {
      indent: 12,
      lineGap: 4,
    });
  }

  section(doc, "Next Steps");
  const finalSteps = report.nextSteps.filter((step) =>
    [
      "Review mappings",
      "Generate the migration package",
      "Import into a Xero demo organisation",
      "Verify destination balances",
    ].includes(step.title),
  );
  for (const [index, step] of finalSteps.entries()) {
    doc
      .fontSize(10)
      .fillColor("#16202a")
      .text(`${index + 1}. ${step.title}`, { lineGap: 2 });
    doc
      .fontSize(9)
      .fillColor("#5a6673")
      .text(step.description, { indent: 12, lineGap: 4 });
  }
  if (report.supportRecommended) {
    doc
      .moveDown(0.4)
      .fontSize(9)
      .fillColor("#5a6673")
      .text(
        "A deterministic product limitation requires PreconFin review. Contact PreconFin with the report reference.",
      );
  }

  doc.end();
  return done;
}

export async function generateMigrationHealthPdf({
  snapshot,
  plan,
  validation,
  assessment,
}: PdfReportInput): Promise<Buffer> {
  if (assessment) return generateFinancialAssessmentPdf(assessment);
  const doc = new PDFDocument({
    size: "LETTER",
    margin: 56,
    info: { Title: "PreconFin Migration Health Report", Author: "PreconFin" },
  });
  const done = collect(doc);

  doc.rect(0, 0, 612, 96).fill("#16202a");
  doc
    .fillColor("#ffffff")
    .fontSize(23)
    .text("PreconFin Migration Health Report", 56, 34);
  doc
    .fontSize(10)
    .fillColor("#c9d7d3")
    .text("QBO to Xero migration readiness", 56, 64);

  doc
    .fillColor("#16202a")
    .fontSize(24)
    .text(snapshot.organization.displayName, 56, 130);
  doc
    .fontSize(11)
    .fillColor("#5a6673")
    .text(
      `Generated ${new Date(validation.summary.generatedAt).toLocaleString("en-US")}`,
    );

  section(doc, "Summary");
  keyValue(doc, "Migration score", `${validation.summary.score}/100`);
  keyValue(doc, "Readiness", validation.summary.readiness.replace("_", " "));
  keyValue(doc, "Errors", validation.summary.errorCount);
  keyValue(doc, "Warnings", validation.summary.warningCount);
  keyValue(doc, "Accounts", snapshot.accounts.length);
  keyValue(doc, "Contacts", snapshot.contacts.length);
  keyValue(doc, "Invoices", snapshot.invoices.length);
  keyValue(doc, "Bills", snapshot.bills.length);

  section(doc, "Company");
  keyValue(doc, "Legal name", snapshot.organization.legalName);
  keyValue(doc, "Base currency", snapshot.organization.baseCurrency);
  keyValue(
    doc,
    "QuickBooks realm",
    snapshot.organization.qboRealmId ?? "Not provided",
  );

  section(doc, "Readiness");
  const readinessText =
    validation.summary.readiness === "ready"
      ? "The migration package is ready for controlled review and Xero test import."
      : validation.summary.readiness === "review_needed"
        ? "The migration package can be generated, but warnings should be reviewed before import."
        : "Errors must be resolved before importing this package into Xero.";
  doc.fontSize(11).fillColor("#16202a").text(readinessText, { lineGap: 4 });

  section(doc, "Top Findings");
  const findings = validation.findings.slice(0, 14);
  if (!findings.length) {
    doc.fontSize(11).text("No blocking validation findings were detected.");
  }
  for (const finding of findings) {
    doc
      .fontSize(10)
      .fillColor(finding.severity === "error" ? "#a32929" : "#946200")
      .text(`${finding.severity.toUpperCase()} — ${finding.title}`);
    doc.fillColor("#16202a").text(finding.message, { indent: 12, lineGap: 2 });
    doc
      .fillColor("#5a6673")
      .text(finding.recommendation, { indent: 12, lineGap: 4 });
  }

  section(doc, "Account Mapping");
  const scopeSummary = plan.accountScopeSummary;
  const legacyDecisions = plan.accountMappings.filter(
    (mapping) => mapping.confidence !== "high",
  );
  keyValue(
    doc,
    "Automatically mapped",
    scopeSummary?.autoMappedAccounts ??
      plan.accountMappings.length - legacyDecisions.length,
  );
  keyValue(
    doc,
    "Needs confirmation",
    scopeSummary?.decisionRequiredAccounts ?? legacyDecisions.length,
  );
  keyValue(
    doc,
    "Excluded because unused",
    scopeSummary?.excludedUnusedAccounts ?? 0,
  );
  const decisionIds = new Set(
    plan.accountScope
      ? plan.accountScope
          .filter((scope) => scope.disposition === "decision_required")
          .map((scope) => scope.sourceId)
      : legacyDecisions.map((mapping) => mapping.sourceId),
  );
  for (const mapping of plan.accountMappings
    .filter((item) => decisionIds.has(item.sourceId))
    .slice(0, 12)) {
    doc
      .fontSize(9)
      .fillColor("#16202a")
      .text(
        `${mapping.sourceName} → ${mapping.targetCode ?? ""} ${mapping.targetName} (${mapping.targetType})`,
      );
  }

  section(doc, "Recommendations");
  for (const recommendation of validation.recommendations) {
    doc
      .fontSize(10)
      .fillColor("#16202a")
      .text(`• ${recommendation}`, { lineGap: 4 });
  }

  section(doc, "Next Steps");
  doc
    .fontSize(10)
    .fillColor("#16202a")
    .text("1. Resolve errors and review warnings.", { lineGap: 4 });
  doc.text("2. Import CSV files into a Xero demo organization first.", {
    lineGap: 4,
  });
  doc.text(
    "3. Reconcile AR, AP, bank balances, retained earnings, and tax balances.",
    { lineGap: 4 },
  );
  doc.text("4. Book a PreconFin consultation for assisted migration review.", {
    lineGap: 4,
  });

  doc.end();
  return done;
}
