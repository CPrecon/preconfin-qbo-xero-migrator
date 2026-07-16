import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicMigrationAssessment } from "@preconfin/financial-assessment-engine";
import { AssessmentReport } from "./assessment-report";

const report: PublicMigrationAssessment = {
  readiness: {
    state: "ready_with_review",
    label: "Ready with Review",
    explanation: "No blocking financial control failed.",
  },
  executiveSummary:
    "Your books appear to be in good overall condition. No blocking accounting issues were identified. One migration decision requires review. No material financial integrity concerns were identified.",
  scores: {
    financialHealth: 96,
    migrationReadiness: 84,
    manualReviewRequired: 1,
  },
  summary: {
    primaryRecommendation: "Confirm the remaining migration decision.",
    blockingIssueCount: 0,
    actionRequiredCount: 0,
    reviewItemCount: 1,
  },
  controls: [
    {
      title: "Trial Balance",
      status: "passed",
      statusLabel: "Passed",
      explanation: "Total debits and credits agree within tolerance.",
      evidence:
        "Total debits less credits: USD 0.00. Expected net balance: USD 0.00.",
      businessImpact:
        "An out-of-balance ledger cannot be migrated or reconciled reliably.",
      difference: 0,
      currency: "USD",
    },
    {
      title: "Tax Liability",
      status: "unavailable",
      statusLabel: "Not Assessed",
      explanation: "A tax liability report was not available.",
      evidence:
        "The comparison data needed for this control was not available.",
      businessImpact:
        "An incorrect tax liability can carry an inaccurate obligation into Xero.",
      difference: null,
      currency: "USD",
    },
  ],
  recommendations: [
    {
      priority: 1,
      title: "Confirm Xero system account",
      action: "Confirm the proposed destination account.",
      businessImpact: "The opening equity position must remain intact.",
      estimatedEffort: "Manual Mapping",
      expectedCompletionTime: "2-5 minutes",
      fixLocation: "xero",
    },
  ],
  mappingReview: {
    automaticallyAccepted: 1,
    requiresReview: 1,
    excludedUnused: 4,
    mappings: [
      {
        title: "Office Expenses",
        target: "400 Office Expenses (EXPENSE)",
        reason: "QuickBooks Expense has one standard Xero treatment.",
        proposedTreatment: "400 Office Expenses (EXPENSE)",
        businessReason: "QuickBooks Expense has one standard Xero treatment.",
        requiredAction:
          "No action is required. This mapping is automatically accepted.",
        confidenceClassification: "Automatic",
        group: "Accounts",
        reviewStatus: "automatically_accepted",
      },
      {
        title: "Accounts Payable",
        target: "200 Accounts Payable (CURRLIAB)",
        reason: "Accounts payable is a standard Xero system account.",
        proposedTreatment: "200 Accounts Payable (CURRLIAB)",
        businessReason: "Accounts payable is a standard Xero system account.",
        requiredAction:
          "Confirm the destination Xero accounts-payable system account.",
        confidenceClassification: "Recommended",
        group: "System Accounts",
        reviewStatus: "requires_review",
      },
    ],
  },
  nextSteps: [
    {
      sequence: 1,
      title: "Resolve accounting issues",
      description: "Correct failed financial controls.",
      required: false,
    },
    {
      sequence: 2,
      title: "Confirm migration decisions",
      description: "Review treatments that require judgement.",
      required: true,
    },
    {
      sequence: 3,
      title: "Generate migration package",
      description: "Create the reviewed Xero-ready files.",
      required: true,
    },
    {
      sequence: 4,
      title: "Import into Xero Demo Organisation",
      description: "Test the package in a disposable organisation.",
      required: true,
    },
    {
      sequence: 5,
      title: "Verify Trial Balance",
      description: "Compare destination balances.",
      required: true,
    },
    {
      sequence: 6,
      title: "Go Live",
      description: "Proceed after destination reconciliation.",
      required: true,
    },
  ],
  supportRecommended: false,
};

describe("AssessmentReport", () => {
  it("renders the accountant-facing hierarchy without technical or percentage language", () => {
    const html = renderToStaticMarkup(
      createElement(AssessmentReport, {
        report,
        reportDownloadUrl: "https://example.invalid/report.pdf",
      }),
    );

    expect(html).toContain("PreconFin Financial Assessment");
    expect(html).toContain("Executive summary");
    expect(html).toContain("Financial controls");
    expect(html).toContain("Not Assessed");
    expect(html).toContain("View evidence");
    expect(html).toContain("Automatic mappings");
    expect(html).toContain("System Accounts");
    expect(html).toContain("Recommended");
    expect(html.match(/>Accounts Payable</g)).toHaveLength(1);
    expect(html).not.toMatch(
      /\d+% confidence|Unknown|sourceId|decisionKey|rootKey|entityId/,
    );
  });

  it("renders the complete consultant workflow and final report actions", () => {
    const html = renderToStaticMarkup(
      createElement(AssessmentReport, {
        report,
        reportDownloadUrl: "https://example.invalid/report.pdf",
      }),
    );

    for (const step of report.nextSteps) {
      expect(html).toContain(step.title);
    }
    expect(html).toContain("Book Consultation");
    expect(html).toContain("Download Report");
    expect(html).toContain("Email Report");
    expect(html).toContain("Need help interpreting this assessment?");
  });

  it("keeps disclosures and controls keyboard-addressable", () => {
    const html = renderToStaticMarkup(
      createElement(AssessmentReport, {
        report,
        onRequestReport: () => undefined,
      }),
    );

    expect(html).toContain("<summary");
    expect(html).toContain('type="button"');
    expect(html).toContain("focus:ring-2");
    expect(html).toContain('aria-labelledby="assessment-heading"');
  });
});
