import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import type { AccountingSnapshot } from "@preconfin/canonical-model";
import {
  createFinancialAssessment,
  toPublicMigrationAssessment,
  type FinancialAssessmentV1,
  type PublicMappingGroup,
  type PublicMigrationAssessment,
} from "@preconfin/financial-assessment-engine";
import type { MigrationPlan } from "@preconfin/migration-engine";
import type { ValidationReport } from "@preconfin/validation-engine";

export interface PdfReportInput {
  snapshot: AccountingSnapshot;
  plan: MigrationPlan;
  validation: ValidationReport;
  assessment?: FinancialAssessmentV1;
}

const pageWidth = 612;
const pageHeight = 792;
const margin = 56;
const contentWidth = pageWidth - margin * 2;
const bottom = pageHeight - margin - 28;
const colors = {
  ink: "#16202a",
  muted: "#5a6673",
  teal: "#185c60",
  paleTeal: "#e9f5f3",
  paper: "#f8faf9",
  border: "#dce2e0",
  red: "#a32929",
  amber: "#946200",
  white: "#ffffff",
};

const mappingGroupOrder: readonly PublicMappingGroup[] = [
  "System Accounts",
  "Tax",
  "Credit Cards",
  "Tracking",
  "Accounts",
  "Other",
];

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

function detailPageHeader(doc: PDFKit.PDFDocument): void {
  doc
    .fontSize(8)
    .fillColor(colors.teal)
    .text("PRECONFIN FINANCIAL ASSESSMENT", margin, 32, {
      characterSpacing: 0.6,
    });
  doc
    .moveTo(margin, 50)
    .lineTo(pageWidth - margin, 50)
    .strokeColor(colors.border)
    .stroke();
  doc.y = 68;
}

function addDetailPage(doc: PDFKit.PDFDocument): void {
  doc.addPage();
  detailPageHeader(doc);
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
  if (doc.y + height <= bottom) return;
  addDetailPage(doc);
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 62);
  doc
    .moveDown(0.8)
    .fontSize(8)
    .fillColor(colors.teal)
    .text(title.toUpperCase(), { characterSpacing: 0.7 });
  doc
    .moveDown(0.35)
    .fontSize(18)
    .fillColor(colors.ink)
    .text(title)
    .moveDown(0.7);
}

function statusColor(status: string): string {
  if (status === "failed") return colors.red;
  if (status === "warning" || status === "unavailable") return colors.amber;
  if (status === "passed") return colors.teal;
  return colors.muted;
}

function displayLocation(value: string): string {
  if (value === "quickbooks") return "QuickBooks";
  if (value === "xero") return "Xero";
  if (value === "preconfin") return "PreconFin";
  if (value === "accountant") return "Accountant";
  if (value === "source_system") return "Source system";
  return "Review only";
}

function executivePage(
  doc: PDFKit.PDFDocument,
  assessment: FinancialAssessmentV1,
  report: PublicMigrationAssessment,
): void {
  doc.rect(0, 0, pageWidth, 104).fill(colors.ink);
  doc
    .fillColor(colors.white)
    .fontSize(23)
    .text("PreconFin Financial Assessment", margin, 31);
  doc
    .fontSize(10)
    .fillColor("#c9d7d3")
    .text("Migration Readiness for Xero", margin, 66);

  doc
    .fillColor(colors.ink)
    .fontSize(20)
    .text(assessment.organization.displayName, margin, 128, {
      width: contentWidth,
    });
  doc
    .fontSize(9)
    .fillColor(colors.muted)
    .text(
      `Period ending ${assessment.period.endDate}  |  ${assessment.basis} basis  |  ${assessment.currency}`,
      margin,
      157,
    );

  doc.roundedRect(margin, 190, contentWidth, 118, 4).fill(colors.paper);
  const metricWidth = contentWidth / 4;
  const metrics = [
    ["Overall Status", report.readiness.label],
    ["Financial Health", `${report.scores.financialHealth}/100`],
    ["Migration Readiness", `${report.scores.migrationReadiness}/100`],
    ["Manual Review", String(report.scores.manualReviewRequired)],
  ];
  for (const [index, [label, value]] of metrics.entries()) {
    const x = margin + metricWidth * index;
    if (index > 0) {
      doc.moveTo(x, 210).lineTo(x, 288).strokeColor(colors.border).stroke();
    }
    doc
      .fontSize(8)
      .fillColor(colors.muted)
      .text(label!.toUpperCase(), x + 16, 216, {
        width: metricWidth - 32,
        characterSpacing: 0.35,
      });
    doc
      .fontSize(index === 0 ? 18 : 25)
      .fillColor(index === 0 ? colors.teal : colors.ink)
      .text(value!, x + 16, 246, {
        width: metricWidth - 32,
      });
  }

  doc
    .fontSize(8)
    .fillColor(colors.teal)
    .text("EXECUTIVE SUMMARY", margin, 342, { characterSpacing: 0.7 });
  doc
    .fontSize(12)
    .fillColor(colors.ink)
    .text(report.executiveSummary, margin, 364, {
      width: contentWidth,
      lineGap: 5,
    });

  doc
    .fontSize(8)
    .fillColor(colors.teal)
    .text("FINANCIAL CONTROLS", margin, 470, { characterSpacing: 0.7 });
  const controlTop = 494;
  const controlColumnWidth = contentWidth / 2;
  report.controls.slice(0, 10).forEach((control, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + column * controlColumnWidth;
    const y = controlTop + row * 35;
    doc
      .fontSize(8)
      .fillColor(statusColor(control.status))
      .text(control.statusLabel.toUpperCase(), x, y, { width: 78 });
    doc
      .fontSize(9)
      .fillColor(colors.ink)
      .text(control.title, x + 80, y, {
        width: controlColumnWidth - 92,
      });
  });

  const actionY = 688;
  doc
    .moveTo(margin, actionY - 14)
    .lineTo(pageWidth - margin, actionY - 14)
    .strokeColor(colors.border)
    .stroke();
  doc
    .fontSize(9)
    .fillColor(colors.muted)
    .text(
      `${report.summary.blockingIssueCount} blocking  |  ${report.summary.actionRequiredCount} actions required  |  ${report.mappingReview.requiresReview} migration decisions`,
      margin,
      actionY,
      { width: contentWidth },
    );
}

function renderControls(
  doc: PDFKit.PDFDocument,
  report: PublicMigrationAssessment,
): void {
  sectionTitle(doc, "Financial Controls");
  for (const control of report.controls) {
    const explanationHeight = doc.heightOfString(
      `Why this status: ${control.explanation}`,
      {
        width: contentWidth - 24,
        lineGap: 2,
      },
    );
    const impactHeight = doc.heightOfString(control.businessImpact, {
      width: contentWidth - 24,
      lineGap: 2,
    });
    const evidenceHeight = doc.heightOfString(control.evidence, {
      width: contentWidth - 24,
      lineGap: 2,
    });
    const height = 68 + explanationHeight + impactHeight + evidenceHeight;
    ensureSpace(doc, height);
    const startY = doc.y;
    doc
      .fontSize(10)
      .fillColor(statusColor(control.status))
      .text(control.statusLabel.toUpperCase(), margin, startY, { width: 90 });
    doc
      .fontSize(12)
      .fillColor(colors.ink)
      .text(control.title, margin + 96, startY, {
        width: contentWidth - 96,
      });
    doc
      .fontSize(9)
      .fillColor(colors.muted)
      .text(
        `Why this status: ${control.explanation}`,
        margin + 24,
        startY + 25,
        {
          width: contentWidth - 24,
          lineGap: 2,
        },
      );
    doc
      .fontSize(9)
      .fillColor(colors.ink)
      .text(
        `Business impact: ${control.businessImpact}`,
        margin + 24,
        doc.y + 5,
        {
          width: contentWidth - 24,
          lineGap: 2,
        },
      );
    doc
      .fontSize(8)
      .fillColor(colors.muted)
      .text(`Evidence: ${control.evidence}`, margin + 24, doc.y + 5, {
        width: contentWidth - 24,
        lineGap: 2,
      });
    doc
      .moveTo(margin, doc.y + 10)
      .lineTo(pageWidth - margin, doc.y + 10)
      .strokeColor(colors.border)
      .stroke();
    doc.y += 20;
  }
}

function renderRecommendations(
  doc: PDFKit.PDFDocument,
  report: PublicMigrationAssessment,
): void {
  sectionTitle(doc, "Action Required");
  if (!report.recommendations.length) {
    doc
      .fontSize(10)
      .fillColor(colors.ink)
      .text(report.summary.primaryRecommendation, { lineGap: 3 });
    return;
  }
  for (const recommendation of report.recommendations) {
    const text = [recommendation.businessImpact, recommendation.action].join(
      " ",
    );
    const height =
      92 +
      doc.heightOfString(text, {
        width: contentWidth - 28,
        lineGap: 2,
      });
    ensureSpace(doc, height);
    const startY = doc.y;
    doc
      .roundedRect(margin, startY, contentWidth, height - 12, 4)
      .fill(colors.paper);
    doc
      .fontSize(8)
      .fillColor(colors.teal)
      .text(`PRIORITY ${recommendation.priority}`, margin + 14, startY + 14);
    doc
      .fontSize(12)
      .fillColor(colors.ink)
      .text(recommendation.title, margin + 14, startY + 31, {
        width: contentWidth - 28,
      });
    doc
      .fontSize(8)
      .fillColor(colors.muted)
      .text(
        `${recommendation.expectedCompletionTime}  |  ${recommendation.estimatedEffort}  |  ${displayLocation(recommendation.fixLocation)}`,
        margin + 14,
        doc.y + 7,
        { width: contentWidth - 28 },
      );
    doc
      .fontSize(9)
      .fillColor(colors.ink)
      .text(
        `Business impact: ${recommendation.businessImpact}`,
        margin + 14,
        doc.y + 8,
        {
          width: contentWidth - 28,
          lineGap: 2,
        },
      );
    doc
      .fontSize(9)
      .fillColor(colors.muted)
      .text(
        `Primary action: ${recommendation.action}`,
        margin + 14,
        doc.y + 5,
        {
          width: contentWidth - 28,
          lineGap: 2,
        },
      );
    doc.y = startY + height;
  }
}

function renderMappingReview(
  doc: PDFKit.PDFDocument,
  report: PublicMigrationAssessment,
): void {
  sectionTitle(doc, "Mapping Review");
  doc
    .fontSize(10)
    .fillColor(colors.ink)
    .text(
      `Automatically mapped: ${report.mappingReview.automaticallyAccepted}  |  Needs confirmation: ${report.mappingReview.requiresReview}  |  Excluded because unused: ${report.mappingReview.excludedUnused}`,
      { lineGap: 3 },
    );
  doc
    .moveDown(0.4)
    .fontSize(9)
    .fillColor(colors.muted)
    .text(
      "Routine mappings are accepted automatically. Only decisions requiring judgement are detailed below.",
      { lineGap: 3 },
    );

  const manual = report.mappingReview.mappings.filter(
    (mapping) => mapping.reviewStatus === "requires_review",
  );
  if (!manual.length) {
    doc
      .moveDown(0.8)
      .fontSize(10)
      .fillColor(colors.teal)
      .text("No manual mapping decisions remain.");
    return;
  }
  for (const group of mappingGroupOrder) {
    const mappings = manual.filter((mapping) => mapping.group === group);
    if (!mappings.length) continue;
    ensureSpace(doc, 54);
    doc
      .moveDown(0.9)
      .fontSize(11)
      .fillColor(colors.ink)
      .text(`${group} (${mappings.length})`);
    doc.moveDown(0.3);
    for (const mapping of mappings) {
      const body = [
        mapping.proposedTreatment,
        mapping.businessReason,
        mapping.requiredAction,
      ].join(" ");
      const height =
        76 +
        doc.heightOfString(body, {
          width: contentWidth - 24,
          lineGap: 2,
        });
      ensureSpace(doc, height);
      doc
        .fontSize(10)
        .fillColor(colors.ink)
        .text(mapping.title, margin + 12, doc.y, {
          width: contentWidth - 124,
        });
      doc
        .fontSize(8)
        .fillColor(colors.amber)
        .text(
          mapping.confidenceClassification.toUpperCase(),
          margin + contentWidth - 112,
          doc.y - 10,
          {
            width: 112,
            align: "right",
          },
        );
      doc
        .fontSize(9)
        .fillColor(colors.muted)
        .text(
          `Proposed treatment: ${mapping.proposedTreatment}`,
          margin + 24,
          doc.y + 5,
          {
            width: contentWidth - 24,
            lineGap: 2,
          },
        );
      doc.text(
        `Business reason: ${mapping.businessReason}`,
        margin + 24,
        doc.y + 4,
        {
          width: contentWidth - 24,
          lineGap: 2,
        },
      );
      doc
        .fillColor(colors.ink)
        .text(
          `Required action: ${mapping.requiredAction}`,
          margin + 24,
          doc.y + 4,
          {
            width: contentWidth - 24,
            lineGap: 2,
          },
        );
      doc
        .moveTo(margin + 12, doc.y + 8)
        .lineTo(pageWidth - margin, doc.y + 8)
        .strokeColor(colors.border)
        .stroke();
      doc.y += 17;
    }
  }
}

function renderNextSteps(
  doc: PDFKit.PDFDocument,
  report: PublicMigrationAssessment,
): void {
  sectionTitle(doc, "Recommended Sequence");
  for (const step of report.nextSteps) {
    ensureSpace(doc, 58);
    const startY = doc.y;
    doc.circle(margin + 13, startY + 13, 13).fill(colors.paleTeal);
    doc
      .fontSize(9)
      .fillColor(colors.teal)
      .text(String(step.sequence), margin + 9, startY + 8, {
        width: 8,
        align: "center",
      });
    doc
      .fontSize(11)
      .fillColor(colors.ink)
      .text(step.title, margin + 42, startY, {
        width: contentWidth - 42,
      });
    doc
      .fontSize(9)
      .fillColor(colors.muted)
      .text(step.description, margin + 42, doc.y + 4, {
        width: contentWidth - 42,
        lineGap: 2,
      });
    doc.y += 14;
  }
}

function renderClosing(
  doc: PDFKit.PDFDocument,
  report: PublicMigrationAssessment,
): void {
  ensureSpace(doc, 116);
  const startY = doc.y + 10;
  doc.roundedRect(margin, startY, contentWidth, 94, 4).fill(colors.ink);
  doc
    .fontSize(15)
    .fillColor(colors.white)
    .text("Need help interpreting this assessment?", margin + 18, startY + 18, {
      width: contentWidth - 36,
    });
  doc
    .fontSize(9)
    .fillColor("#c9d7d3")
    .text(
      report.supportRecommended
        ? "A deterministic product limitation requires review. Book a free migration review with PreconFin."
        : "Book a free migration review with PreconFin.",
      margin + 18,
      startY + 45,
      { width: contentWidth - 36, lineGap: 2 },
    );
  doc
    .fontSize(9)
    .fillColor(colors.white)
    .text("preconfin.com/contact", margin + 18, startY + 73);
  doc.y = startY + 106;
}

export async function generateFinancialAssessmentPdf(
  assessment: FinancialAssessmentV1,
): Promise<Buffer> {
  const report = toPublicMigrationAssessment(assessment);
  const doc = new PDFDocument({
    size: "LETTER",
    margin,
    bufferPages: true,
    info: {
      Title: "PreconFin Financial Assessment",
      Subject: "Migration Readiness for Xero",
      Author: "PreconFin",
    },
  });
  const done = collect(doc);

  executivePage(doc, assessment, report);
  addDetailPage(doc);
  renderControls(doc, report);
  renderRecommendations(doc, report);
  renderMappingReview(doc, report);
  renderNextSteps(doc, report);
  renderClosing(doc, report);

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc
      .fontSize(8)
      .fillColor(colors.muted)
      .text(
        `PreconFin Financial Assessment  |  Page ${index + 1} of ${range.count}`,
        margin,
        pageHeight - margin - 14,
        { width: contentWidth, align: "right", lineBreak: false },
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
  const canonicalAssessment =
    assessment ??
    createFinancialAssessment({
      snapshot,
      plan,
      assessmentType: "migration_readiness",
      generatedAt: validation.summary.generatedAt,
    });
  return generateFinancialAssessmentPdf(canonicalAssessment);
}
