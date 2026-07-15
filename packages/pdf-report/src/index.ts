import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import type { AccountingSnapshot } from "@preconfin/canonical-model";
import type { MigrationPlan } from "@preconfin/migration-engine";
import type { ValidationReport } from "@preconfin/validation-engine";

export interface PdfReportInput {
  snapshot: AccountingSnapshot;
  plan: MigrationPlan;
  validation: ValidationReport;
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

export async function generateMigrationHealthPdf({
  snapshot,
  plan,
  validation,
}: PdfReportInput): Promise<Buffer> {
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
  for (const mapping of plan.accountMappings.slice(0, 18)) {
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
