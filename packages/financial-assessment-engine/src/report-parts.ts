import { sortedUnique } from "./stable.js";
import type {
  AssessmentCoverage,
  AssessmentDecision,
  AssessmentEvidenceSummary,
  AssessmentFinding,
  AssessmentNextStep,
  AssessmentRecommendation,
  AssessmentSummary,
  ExpectedCompletionTime,
  FindingGroup,
  FinancialControl,
  VerificationEvidence,
} from "./types.js";

function groupForFinding(finding: AssessmentFinding): FindingGroup["code"] {
  if (
    finding.fixLocation === "quickbooks" ||
    finding.fixLocation === "source_system"
  )
    return "resolve_in_source";
  if (finding.fixLocation === "preconfin") return "resolve_in_preconfin";
  if (finding.category === "evidence") return "review_supporting_evidence";
  return "optional_cleanup";
}

const groupTitles: Record<FindingGroup["code"], string> = {
  resolve_in_source: "Resolve in QuickBooks",
  resolve_in_preconfin: "Resolve in PreconFin",
  review_supporting_evidence: "Review Supporting Evidence",
  optional_cleanup: "Optional Cleanup",
};

export function buildFindingGroups(
  findings: readonly AssessmentFinding[],
): FindingGroup[] {
  const groups = new Map<FindingGroup["code"], string[]>();
  for (const finding of findings) {
    const code = groupForFinding(finding);
    groups.set(code, [...(groups.get(code) ?? []), finding.issueKey]);
  }
  return (
    [
      "resolve_in_source",
      "resolve_in_preconfin",
      "review_supporting_evidence",
      "optional_cleanup",
    ] as const
  )
    .filter((code) => groups.has(code))
    .map((code) => {
      const issueKeys = sortedUnique(groups.get(code) ?? []);
      return {
        code,
        title: groupTitles[code],
        issueKeys,
        count: issueKeys.length,
      };
    });
}

const controlRecommendationDetails: Record<
  string,
  {
    action: string;
    businessImpact: string;
    estimatedEffort: AssessmentRecommendation["estimatedEffort"];
    expectedCompletionTime: ExpectedCompletionTime;
  }
> = {
  CONTROL_TRIAL_BALANCE: {
    action:
      "Review the trial balance difference in QuickBooks and correct the underlying entries before migration.",
    businessImpact:
      "An out-of-balance ledger cannot be reconciled reliably in Xero.",
    estimatedEffort: "Accountant Review",
    expectedCompletionTime: "15-60 minutes",
  },
  CONTROL_ACCOUNTS_RECEIVABLE: {
    action:
      "Compare open invoices with the QuickBooks AR aging report and correct the unmatched balance.",
    businessImpact:
      "Customer balances may be misstated after migration if receivables do not agree.",
    estimatedEffort: "Quick Review",
    expectedCompletionTime: "5-15 minutes",
  },
  CONTROL_ACCOUNTS_PAYABLE: {
    action:
      "Compare open bills with the QuickBooks AP aging report and correct the unmatched balance.",
    businessImpact:
      "Supplier balances may be misstated after migration if payables do not agree.",
    estimatedEffort: "Quick Review",
    expectedCompletionTime: "5-15 minutes",
  },
  CONTROL_BANK_RECONCILIATION: {
    action:
      "Reconcile QuickBooks bank balances to the ledger balance for the conversion date.",
    businessImpact:
      "Unreconciled bank balances reduce confidence in opening cash positions.",
    estimatedEffort: "Accountant Review",
    expectedCompletionTime: "15-60 minutes",
  },
  CONTROL_RETAINED_EARNINGS: {
    action:
      "Review retained earnings across the QuickBooks trial balance and balance sheet.",
    businessImpact:
      "A retained earnings difference can carry an incorrect equity position into Xero.",
    estimatedEffort: "Accountant Review",
    expectedCompletionTime: "15-60 minutes",
  },
  CONTROL_OPENING_BALANCES: {
    action:
      "Review conversion balances and correct the entries preventing them from netting to zero.",
    businessImpact:
      "Opening balances must balance before they can establish a reliable Xero starting position.",
    estimatedEffort: "Accountant Review",
    expectedCompletionTime: "15-60 minutes",
  },
  CONTROL_CLOSING_BALANCES: {
    action:
      "Compare account-level closing balances across the QuickBooks source reports.",
    businessImpact:
      "Closing-balance differences can create destination reconciliation breaks.",
    estimatedEffort: "Accountant Review",
    expectedCompletionTime: "15-60 minutes",
  },
  CONTROL_TAX_LIABILITY: {
    action:
      "Reconcile the QuickBooks tax-liability balance before selecting Xero tax mappings.",
    businessImpact:
      "A tax-liability difference can carry an incorrect amount into the destination ledger.",
    estimatedEffort: "Accountant Review",
    expectedCompletionTime: "15-30 minutes",
  },
};

function completionTime(
  effort: AssessmentRecommendation["estimatedEffort"],
): ExpectedCompletionTime {
  if (effort === "Quick Review") return "2-5 minutes";
  if (effort === "Source System Change") return "5-15 minutes";
  if (effort === "Manual Mapping") return "5-15 minutes";
  return "15-60 minutes";
}

function failedControlRecommendations(
  controls: readonly FinancialControl[],
): AssessmentRecommendation[] {
  const failed = controls.filter(
    (control) => control.blockingGate && control.status === "failed",
  );
  return failed.map((control) => {
    const details = controlRecommendationDetails[control.code] ?? {
      action:
        "Review and correct the source balances behind this failed control, then rerun the assessment.",
      businessImpact:
        "A failed financial control reduces confidence in the migration starting position.",
      estimatedEffort: "Accountant Review" as const,
      expectedCompletionTime: "15-60 minutes" as const,
    };
    return {
      code: `RESOLVE_${control.code}`,
      priority: 1,
      title: `Resolve ${control.title} difference`,
      action: details.action,
      reason: control.explanation,
      relatedIssueKeys: [control.code],
      estimatedEffort: details.estimatedEffort,
      fixLocation: "quickbooks",
      businessImpact: details.businessImpact,
      expectedCompletionTime: details.expectedCompletionTime,
    };
  });
}

function operationalControlRecommendation(
  controls: readonly FinancialControl[],
): AssessmentRecommendation | undefined {
  const affected = controls.filter(
    (control) =>
      !control.blockingGate &&
      (control.status === "failed" || control.status === "warning"),
  );
  if (!affected.length) return undefined;
  return {
    code: "REFRESH_ASSESSMENT_INPUTS",
    priority: 3,
    title: "Refresh assessment inputs",
    action:
      "Refresh the QuickBooks connection and rerun the assessment to restore current source and evidence coverage.",
    reason:
      affected.map((control) => control.title).join(", ") +
      " requires refreshed source evidence.",
    relatedIssueKeys: affected.map((control) => control.code),
    estimatedEffort: "Quick Review",
    fixLocation: "preconfin",
    businessImpact:
      "Stale or incomplete source evidence can make an otherwise correct assessment unreliable.",
    expectedCompletionTime: "2-5 minutes",
  };
}

function incompleteControlRecommendation(
  controls: readonly FinancialControl[],
): AssessmentRecommendation | undefined {
  const missing = controls.filter(
    (control) => control.blockingGate && control.status === "unavailable",
  );
  if (!missing.length) return undefined;
  return {
    code: "COMPLETE_ASSESSMENT_COVERAGE",
    priority: 2,
    title: "Complete assessment coverage",
    action:
      "Refresh QuickBooks and make the missing reports available before relying on the assessment.",
    reason:
      missing.map((control) => control.title).join(", ") +
      " could not be evaluated.",
    relatedIssueKeys: missing.map((control) => control.code),
    estimatedEffort: "Quick Review",
    fixLocation: "preconfin",
    businessImpact:
      "Unavailable controls leave part of the financial position unassessed.",
    expectedCompletionTime: "2-5 minutes",
  };
}

export function buildRecommendations(
  controls: readonly FinancialControl[],
  findings: readonly AssessmentFinding[],
  decisions: readonly AssessmentDecision[],
): AssessmentRecommendation[] {
  const recommendations: AssessmentRecommendation[] = [];
  const failed = failedControlRecommendations(controls);
  const incomplete = incompleteControlRecommendation(controls);
  const operational = operationalControlRecommendation(controls);
  recommendations.push(...failed);
  if (incomplete) recommendations.push(incomplete);
  if (operational) recommendations.push(operational);

  const sourceFindings = findings.filter(
    (finding) =>
      finding.issueClass === "source_data_quality" ||
      finding.issueClass === "financial_integrity",
  );
  recommendations.push(
    ...sourceFindings.map((finding) => ({
      code: `RESOLVE_${finding.issueKey}`,
      priority: 3,
      title: finding.title,
      action: finding.recommendedAction,
      reason: finding.explanation,
      relatedIssueKeys: [finding.issueKey],
      estimatedEffort: finding.estimatedEffort,
      fixLocation: finding.fixLocation,
      businessImpact: finding.businessImpact,
      expectedCompletionTime: completionTime(finding.estimatedEffort),
    })),
  );

  if (decisions.length) {
    recommendations.push({
      code: "CONFIRM_MIGRATION_DECISIONS",
      priority: 4,
      title: "Confirm migration decisions",
      action:
        "Review account, tax, and tracking suggestions before generating final Xero files.",
      reason:
        "Mapping decisions are target-system choices, not accounting defects.",
      relatedIssueKeys: decisions.map((decision) => decision.decisionKey),
      estimatedEffort: "Manual Mapping",
      fixLocation: "xero",
      businessImpact:
        "Confirmed mappings preserve the intended account, tax, and reporting treatment in Xero.",
      expectedCompletionTime:
        decisions.length <= 3 ? "5-15 minutes" : "15-30 minutes",
    });
  }

  const evidenceFindings = findings.filter(
    (finding) => finding.category === "evidence",
  );
  if (evidenceFindings.length) {
    recommendations.push({
      code: "REVIEW_EVIDENCE",
      priority: 5,
      title: "Review supporting evidence",
      action:
        "Attach or confirm the supporting source documents for affected records.",
      reason:
        "Evidence improves confidence without changing deterministic financial results.",
      relatedIssueKeys: evidenceFindings.map((finding) => finding.issueKey),
      estimatedEffort: "Quick Review",
      fixLocation: "preconfin",
      businessImpact:
        "Supporting evidence increases confidence in the records selected for migration.",
      expectedCompletionTime: "5-15 minutes",
    });
  }

  return recommendations
    .sort(
      (left, right) =>
        left.priority - right.priority || left.code.localeCompare(right.code),
    )
    .map((recommendation, index) => ({
      ...recommendation,
      priority: index + 1,
      relatedIssueKeys: sortedUnique(recommendation.relatedIssueKeys),
    }));
}

export function buildNextSteps(
  controls: readonly FinancialControl[],
  findings: readonly AssessmentFinding[],
  decisions: readonly AssessmentDecision[],
): AssessmentNextStep[] {
  const failedControls = controls.some(
    (control) => control.status === "failed",
  );
  const incompleteControls = controls.some(
    (control) => control.blockingGate && control.status === "unavailable",
  );
  const sourceActions = findings.some(
    (finding) =>
      finding.issueClass === "financial_integrity" ||
      finding.issueClass === "source_data_quality",
  );

  return [
    {
      sequence: 1,
      code: "CONFIRM_PERIOD_AND_BASIS",
      title: "Confirm reporting period and basis",
      description:
        "Confirm that the assessment period and accounting basis match the migration scope.",
      required: true,
      dependsOn: [],
    },
    {
      sequence: 2,
      code: "COMPLETE_CONTROLS",
      title: "Complete financial controls",
      description:
        "Resolve failed controls and refresh any unavailable required reports.",
      required: failedControls || incompleteControls,
      dependsOn: ["CONFIRM_PERIOD_AND_BASIS"],
    },
    {
      sequence: 3,
      code: "RESOLVE_SOURCE_DATA",
      title: "Resolve source-data issues",
      description:
        "Correct genuine accounting and source-record issues in QuickBooks.",
      required: sourceActions,
      dependsOn: ["COMPLETE_CONTROLS"],
    },
    {
      sequence: 4,
      code: "CONFIRM_MAPPINGS",
      title: "Review mappings",
      description: "Confirm account, tax, and tracking treatment for Xero.",
      required: decisions.length > 0,
      dependsOn: ["RESOLVE_SOURCE_DATA"],
    },
    {
      sequence: 5,
      code: "GENERATE_MIGRATION_PACKAGE",
      title: "Generate the migration package",
      description:
        "Generate the reviewed Xero-ready files and Financial Assessment.",
      required: true,
      dependsOn: [
        "COMPLETE_CONTROLS",
        "RESOLVE_SOURCE_DATA",
        "CONFIRM_MAPPINGS",
      ],
    },
    {
      sequence: 6,
      code: "IMPORT_XERO_DEMO",
      title: "Import into a Xero demo organisation",
      description:
        "Test the reviewed migration files in a disposable Xero organisation.",
      required: true,
      dependsOn: ["GENERATE_MIGRATION_PACKAGE"],
    },
    {
      sequence: 7,
      code: "VERIFY_DESTINATION",
      title: "Verify destination balances",
      description:
        "Reconcile trial balance, AR, AP, bank, retained earnings, and tax balances before go-live.",
      required: true,
      dependsOn: ["IMPORT_XERO_DEMO"],
    },
  ];
}

export function buildEvidenceSummary(
  controls: readonly FinancialControl[],
  findings: readonly AssessmentFinding[],
  decisions: readonly AssessmentDecision[],
  verification?: VerificationEvidence,
): AssessmentEvidenceSummary {
  const assessedItems = [...findings, ...decisions];
  const evidence = [
    ...controls.flatMap((control) => control.evidence),
    ...assessedItems.flatMap((item) => item.evidence),
    ...(verification?.evidence ?? []),
  ];
  const evidenceIds = new Set(evidence.map((item) => item.evidenceId));
  const withEvidence = assessedItems.filter(
    (item) => item.evidence.length > 0,
  ).length;
  return {
    evidenceReferenceCount: evidenceIds.size,
    findingWithEvidenceCount: withEvidence,
    findingCount: assessedItems.length,
    coveragePercentage:
      assessedItems.length === 0
        ? 100
        : Math.round((withEvidence / assessedItems.length) * 100),
    sourceSystems: sortedUnique(evidence.map((item) => item.sourceSystem)),
  };
}

export function buildAssessmentCoverage(
  controls: readonly FinancialControl[],
  sourceRecordCount: number,
  sourceRecordWithLineageCount: number,
): AssessmentCoverage {
  const applicable = controls.filter(
    (control) => control.status !== "not_applicable",
  );
  const available = applicable.filter(
    (control) => control.status !== "unavailable",
  );
  return {
    percentage: Math.round(
      (available.length / Math.max(1, applicable.length)) * 100,
    ),
    availableControlCount: available.length,
    applicableControlCount: applicable.length,
    unavailableControlCodes: applicable
      .filter((control) => control.status === "unavailable")
      .map((control) => control.code)
      .sort(),
    sourceRecordCount,
    sourceRecordWithLineageCount,
  };
}

export function buildSummary(
  controls: readonly FinancialControl[],
  findings: readonly AssessmentFinding[],
  decisions: readonly AssessmentDecision[],
  primaryRecommendation: string,
): AssessmentSummary {
  return {
    primaryRecommendation,
    blockingIssueCount:
      controls.filter(
        (control) => control.blockingGate && control.status === "failed",
      ).length +
      findings.filter(
        (finding) =>
          finding.issueClass === "financial_integrity" &&
          finding.workflowImpact === "blocks_workflow",
      ).length,
    actionRequiredCount:
      controls.filter(
        (control) =>
          (!control.blockingGate && control.status === "failed") ||
          (control.blockingGate && control.status === "unavailable"),
      ).length +
      findings.filter(
        (finding) =>
          (finding.workflowImpact === "blocks_workflow" &&
            finding.issueClass !== "financial_integrity") ||
          finding.workflowImpact === "action_required",
      ).length,
    reviewItemCount:
      controls.filter((control) => control.status === "warning").length +
      findings.filter((finding) => finding.workflowImpact === "review_required")
        .length +
      decisions.filter(
        (decision) => decision.workflowImpact === "review_required",
      ).length,
    informationalCount: findings.filter(
      (finding) =>
        finding.issueClass === "information" ||
        finding.severity === "informational",
    ).length,
    decisionCount: decisions.length,
    passedControlCount: controls.filter(
      (control) => control.status === "passed",
    ).length,
    failedControlCount: controls.filter(
      (control) => control.status === "failed",
    ).length,
    unavailableControlCount: controls.filter(
      (control) => control.status === "unavailable",
    ).length,
  };
}
