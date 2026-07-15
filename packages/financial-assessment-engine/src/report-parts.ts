import { sortedUnique } from "./stable.js";
import type {
  AssessmentCoverage,
  AssessmentDecision,
  AssessmentEvidenceSummary,
  AssessmentFinding,
  AssessmentNextStep,
  AssessmentRecommendation,
  AssessmentSummary,
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

function failedControlRecommendation(
  controls: readonly FinancialControl[],
): AssessmentRecommendation | undefined {
  const failed = controls.filter(
    (control) => control.blockingGate && control.status === "failed",
  );
  if (!failed.length) return undefined;
  return {
    code: "RESOLVE_FINANCIAL_CONTROLS",
    priority: 1,
    title: "Resolve failed financial controls",
    action:
      "Review and correct the source balances behind the failed controls, then rerun the assessment.",
    reason:
      failed.map((control) => control.title).join(", ") +
      " did not pass deterministic comparison.",
    relatedIssueKeys: failed.map((control) => control.code),
    estimatedEffort: "Accountant Review",
    fixLocation: "quickbooks",
  };
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
  };
}

export function buildRecommendations(
  controls: readonly FinancialControl[],
  findings: readonly AssessmentFinding[],
  decisions: readonly AssessmentDecision[],
): AssessmentRecommendation[] {
  const recommendations: AssessmentRecommendation[] = [];
  const failed = failedControlRecommendation(controls);
  const incomplete = incompleteControlRecommendation(controls);
  const operational = operationalControlRecommendation(controls);
  if (failed) recommendations.push(failed);
  if (incomplete) recommendations.push(incomplete);
  if (operational) recommendations.push(operational);

  const sourceFindings = findings.filter(
    (finding) =>
      finding.issueClass === "source_data_quality" ||
      finding.issueClass === "financial_integrity",
  );
  if (sourceFindings.length) {
    recommendations.push({
      code: "RESOLVE_SOURCE_FINDINGS",
      priority: 3,
      title: "Resolve source-system findings",
      action:
        "Correct the affected records in QuickBooks and regenerate the assessment.",
      reason:
        "Source corrections are required before the migration package can be finalized.",
      relatedIssueKeys: sourceFindings.map((finding) => finding.issueKey),
      estimatedEffort: sourceFindings.some(
        (finding) => finding.estimatedEffort === "Accountant Review",
      )
        ? "Accountant Review"
        : "Source System Change",
      fixLocation: "quickbooks",
    });
  }

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
      title: "Confirm migration decisions",
      description: "Confirm account, tax, and tracking treatment for Xero.",
      required: decisions.length > 0,
      dependsOn: ["RESOLVE_SOURCE_DATA"],
    },
    {
      sequence: 5,
      code: "REGENERATE_ASSESSMENT",
      title: "Regenerate the assessment",
      description:
        "Run the deterministic assessment again after corrections and decisions.",
      required:
        failedControls ||
        incompleteControls ||
        sourceActions ||
        decisions.length > 0,
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
      dependsOn: ["REGENERATE_ASSESSMENT"],
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
      findings.filter((finding) => finding.workflowImpact === "blocks_workflow")
        .length,
    actionRequiredCount:
      controls.filter(
        (control) =>
          (!control.blockingGate && control.status === "failed") ||
          (control.blockingGate && control.status === "unavailable"),
      ).length +
      findings.filter((finding) => finding.workflowImpact === "action_required")
        .length +
      decisions.filter(
        (decision) => decision.workflowImpact === "action_required",
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
