import { financialAssessmentV1Schema } from "../schema.js";
import { deepFreeze, stableId } from "../stable.js";
import type {
  AssessmentAccountScope,
  AssessmentDecision,
  AssessmentFinding,
  AssessmentOverallStatus,
  ControlStatus,
  ExpectedCompletionTime,
  FinancialControl,
  FinancialAssessmentV1,
} from "../types.js";

export interface MigratorAssessmentAdapter {
  readonly assessment: FinancialAssessmentV1;
  readonly migrationReadinessScore: number;
  readonly blockingFindings: readonly AssessmentFinding[];
  readonly decisionsRequired: readonly AssessmentDecision[];
}

export type PublicMigrationReadinessState =
  "ready" | "ready_with_review" | "needs_attention" | "blocked";

export type PublicMappingConfidence =
  "Automatic" | "Recommended" | "Requires Review" | "Manual Decision";

export type PublicMappingGroup =
  | "System Accounts"
  | "Tax"
  | "Credit Cards"
  | "Tracking"
  | "Accounts"
  | "Other";

export interface PublicMigrationAssessment {
  readonly readiness: {
    readonly state: PublicMigrationReadinessState;
    readonly label:
      "Ready" | "Ready with Review" | "Needs Attention" | "Blocked";
    readonly explanation: string;
  };
  readonly executiveSummary: string;
  readonly scores: {
    readonly financialHealth: number;
    readonly migrationReadiness: number;
    readonly manualReviewRequired: number;
  };
  readonly summary: {
    readonly primaryRecommendation: string;
    readonly blockingIssueCount: number;
    readonly actionRequiredCount: number;
    readonly reviewItemCount: number;
  };
  readonly controls: readonly {
    readonly title: string;
    readonly status: ControlStatus;
    readonly statusLabel:
      "Passed" | "Review" | "Failed" | "Not Assessed" | "Not Applicable";
    readonly explanation: string;
    readonly evidence: string;
    readonly businessImpact: string;
    readonly difference: number | null;
    readonly currency: string;
  }[];
  readonly recommendations: readonly {
    readonly priority: number;
    readonly title: string;
    readonly action: string;
    readonly businessImpact: string;
    readonly estimatedEffort: string;
    readonly expectedCompletionTime: ExpectedCompletionTime;
    readonly fixLocation: string;
  }[];
  readonly mappingReview: {
    readonly automaticallyAccepted: number;
    readonly requiresReview: number;
    readonly excludedUnused: number;
    readonly mappings: readonly {
      readonly title: string;
      readonly target: string;
      readonly reason: string;
      readonly proposedTreatment: string;
      readonly businessReason: string;
      readonly requiredAction: string;
      readonly confidenceClassification: PublicMappingConfidence;
      readonly group: PublicMappingGroup;
      readonly reviewStatus: "automatically_accepted" | "requires_review";
    }[];
  };
  readonly nextSteps: readonly {
    readonly sequence: number;
    readonly title: string;
    readonly description: string;
    readonly required: boolean;
  }[];
  readonly supportRecommended: boolean;
}

type PublicMapping =
  PublicMigrationAssessment["mappingReview"]["mappings"][number];

const controlBusinessImpactByCode: Readonly<Record<string, string>> = {
  CONTROL_TRIAL_BALANCE:
    "An out-of-balance ledger cannot be migrated or reconciled reliably.",
  CONTROL_ACCOUNTS_RECEIVABLE:
    "Customer balances may be misstated if open invoices and receivables do not agree.",
  CONTROL_ACCOUNTS_PAYABLE:
    "Supplier balances may be misstated if open bills and payables do not agree.",
  CONTROL_BANK_RECONCILIATION:
    "Unreconciled bank balances reduce confidence in the opening cash position.",
  CONTROL_RETAINED_EARNINGS:
    "A retained earnings difference can carry an incorrect equity position into Xero.",
  CONTROL_OPENING_BALANCES:
    "Opening balances establish the starting financial position in Xero.",
  CONTROL_CLOSING_BALANCES:
    "Closing-balance differences can create destination reconciliation breaks.",
  CONTROL_TAX_LIABILITY:
    "An incorrect tax liability can carry an inaccurate obligation into Xero.",
  CONTROL_EVIDENCE_COVERAGE:
    "Complete source evidence makes the assessment easier to verify and defend.",
  CONTROL_SOURCE_FRESHNESS:
    "Current source data is required for a reliable migration decision.",
};

function controlStatusLabel(
  status: ControlStatus,
): PublicMigrationAssessment["controls"][number]["statusLabel"] {
  if (status === "passed") return "Passed";
  if (status === "warning") return "Review";
  if (status === "failed") return "Failed";
  if (status === "unavailable") return "Not Assessed";
  return "Not Applicable";
}

function formatControlValue(value: number | null, currency: string): string {
  if (value === null) return "not available";
  return `${currency} ${value.toFixed(2)}`;
}

function controlEvidence(control: FinancialControl): string {
  if (
    control.comparison.sourceValue === null ||
    control.comparison.comparisonValue === null
  ) {
    return control.evidence.length
      ? control.evidence.map((item) => item.label).join(", ")
      : "The comparison data needed for this control was not available.";
  }
  return [
    `${control.comparison.sourceLabel}: ${formatControlValue(control.comparison.sourceValue, control.comparison.currency)}`,
    `${control.comparison.comparisonLabel}: ${formatControlValue(control.comparison.comparisonValue, control.comparison.currency)}`,
    `Difference: ${formatControlValue(control.comparison.difference, control.comparison.currency)}`,
    `Tolerance: ${formatControlValue(control.tolerance, control.comparison.currency)}`,
  ].join(". ");
}

function mappingConfidence(input: {
  automatic: boolean;
  confidence: number;
  effort?: AssessmentDecision["estimatedEffort"];
}): PublicMappingConfidence {
  if (input.automatic) return "Automatic";
  if (input.effort === "Accountant Review" || input.confidence < 0.7) {
    return "Manual Decision";
  }
  if (input.confidence >= 0.9) return "Recommended";
  return "Requires Review";
}

function accountMappingGroup(
  scope: AssessmentAccountScope,
): PublicMappingGroup {
  const roles = new Set(scope.evidence.systemRoles);
  if (roles.has("tax_liability")) return "Tax";
  if (roles.size > 0) return "System Accounts";
  const text =
    `${scope.displayName ?? ""} ${scope.rationale ?? ""}`.toLowerCase();
  if (text.includes("credit-card") || text.includes("credit card")) {
    return "Credit Cards";
  }
  return "Accounts";
}

function decisionGroup(decision: AssessmentDecision): PublicMappingGroup {
  const text =
    `${decision.title} ${decision.explanation} ${decision.recommendedAction}`.toLowerCase();
  if (text.includes("tax")) return "Tax";
  if (
    text.includes("tracking") ||
    text.includes("class") ||
    text.includes("location")
  ) {
    return "Tracking";
  }
  if (text.includes("credit card") || text.includes("credit-card")) {
    return "Credit Cards";
  }
  if (
    text.includes("accounts payable") ||
    text.includes("accounts receivable") ||
    text.includes("retained earnings") ||
    text.includes("system account") ||
    text.includes("opening balance") ||
    text.includes("undeposited funds")
  ) {
    return "System Accounts";
  }
  if (
    decision.affectedRecords.some(
      (record) => record.sourceType === "account",
    ) ||
    text.includes("account")
  ) {
    return "Accounts";
  }
  return "Other";
}

function accountDecisionKey(sourceId: string): string {
  return stableId("decision", "account", [sourceId]);
}

function deduplicateMappings(
  mappings: readonly PublicMapping[],
): PublicMapping[] {
  const byRoot = new Map<string, PublicMapping>();
  for (const mapping of mappings) {
    const root = [mapping.group, mapping.title, mapping.proposedTreatment]
      .join("|")
      .toLowerCase();
    const existing = byRoot.get(root);
    if (!existing) {
      byRoot.set(root, mapping);
      continue;
    }
    if (
      existing.reviewStatus === "automatically_accepted" &&
      mapping.reviewStatus === "requires_review"
    ) {
      byRoot.set(root, mapping);
    }
  }
  return [...byRoot.values()].sort(
    (left, right) =>
      Number(left.reviewStatus === "automatically_accepted") -
        Number(right.reviewStatus === "automatically_accepted") ||
      left.group.localeCompare(right.group) ||
      left.title.localeCompare(right.title),
  );
}

function publicRecommendations(
  assessment: FinancialAssessmentV1,
): PublicMigrationAssessment["recommendations"] {
  const byRoot = new Map<
    string,
    FinancialAssessmentV1["recommendations"][number]
  >();
  for (const recommendation of assessment.recommendations) {
    const root =
      `${recommendation.title}|${recommendation.fixLocation}`.toLowerCase();
    const existing = byRoot.get(root);
    if (!existing || recommendation.priority < existing.priority) {
      byRoot.set(root, recommendation);
    }
  }
  return [...byRoot.values()]
    .sort(
      (left, right) =>
        left.priority - right.priority || left.code.localeCompare(right.code),
    )
    .map((recommendation, index) => ({
      priority: index + 1,
      title: recommendation.title,
      action: recommendation.action,
      businessImpact:
        recommendation.businessImpact ??
        "Completing this action improves migration confidence.",
      estimatedEffort: recommendation.estimatedEffort,
      expectedCompletionTime:
        recommendation.expectedCompletionTime ??
        fallbackCompletionTime(recommendation.estimatedEffort),
      fixLocation: recommendation.fixLocation,
    }));
}

function executiveSummary(
  assessment: FinancialAssessmentV1,
  manualReviewCount: number,
): string {
  const sentences: string[] = [];
  if (assessment.overallStatus === "blocked") {
    sentences.push("Your books need attention before migration.");
  } else if (assessment.overallStatus === "incomplete") {
    sentences.push("Part of your financial position could not be assessed.");
  } else if (assessment.scorecard.financialIntegrity.score >= 85) {
    sentences.push("Your books appear to be in good overall condition.");
  } else {
    sentences.push("Your books need focused review before migration.");
  }

  const blocking = assessment.summary.blockingIssueCount;
  sentences.push(
    blocking === 0
      ? "No blocking accounting issues were identified."
      : `${blocking === 1 ? "One accounting issue should" : `${blocking} accounting issues should`} be resolved before migration.`,
  );
  sentences.push(
    manualReviewCount === 0
      ? "No migration decisions require manual review."
      : `${manualReviewCount} migration decision${manualReviewCount === 1 ? " requires" : "s require"} review.`,
  );
  if (assessment.summary.unavailableControlCount > 0) {
    const count = assessment.summary.unavailableControlCount;
    sentences.push(
      `${count} financial control${count === 1 ? " was" : "s were"} not assessed because comparison evidence was unavailable.`,
    );
  } else if (blocking === 0) {
    sentences.push("No material financial integrity concerns were identified.");
  }
  return sentences.join(" ");
}

function readinessState(status: AssessmentOverallStatus): {
  state: PublicMigrationReadinessState;
  label: PublicMigrationAssessment["readiness"]["label"];
  explanation: string;
} {
  if (status === "blocked") {
    return {
      state: "blocked",
      label: "Blocked",
      explanation:
        "A deterministic financial control failed and must be resolved before migration.",
    };
  }
  if (status === "incomplete" || status === "action_required") {
    return {
      state: "needs_attention",
      label: "Needs Attention",
      explanation:
        "The books need a source correction or additional evidence before final migration.",
    };
  }
  if (status === "review_recommended") {
    return {
      state: "ready_with_review",
      label: "Ready with Review",
      explanation:
        "No blocking financial control failed. Review the remaining migration decisions before import.",
    };
  }
  return {
    state: "ready",
    label: "Ready",
    explanation:
      status === "verified"
        ? "Destination reconciliation evidence verifies the migration."
        : "The required deterministic controls passed for a controlled Xero test import.",
  };
}

function fallbackCompletionTime(effort: string): ExpectedCompletionTime {
  if (effort === "Quick Review") return "2-5 minutes";
  if (effort === "Manual Mapping" || effort === "Source System Change") {
    return "5-15 minutes";
  }
  return "15-60 minutes";
}

export function toPublicMigrationAssessment(
  value: unknown,
): PublicMigrationAssessment {
  const assessment = financialAssessmentV1Schema.parse(value);
  const relevantAccountScope = (assessment.accountScope ?? []).filter(
    (scope) =>
      scope.disposition !== "excluded_unused_account" &&
      scope.displayName &&
      scope.targetType,
  );
  const representedDecisionKeys = new Set(
    relevantAccountScope
      .filter((scope) => scope.disposition === "decision_required")
      .map((scope) => accountDecisionKey(scope.sourceId)),
  );
  const accountMappings: PublicMapping[] = relevantAccountScope.map((scope) => {
    const automatic =
      (scope.reviewStatus ??
        (scope.disposition === "decision_required"
          ? "requires_review"
          : "automatically_accepted")) === "automatically_accepted";
    const proposedTreatment =
        [
          scope.targetCode,
          scope.targetName,
          scope.targetType ? `(${scope.targetType})` : undefined,
        ]
          .filter(Boolean)
          .join(" ") || `Xero ${scope.targetType}`,
      businessReason =
        scope.rationale ??
        "The mapping follows the deterministic account-type catalogue.",
      requiredAction = automatic
        ? "No action is required. This mapping is automatically accepted."
        : (scope.decisionReason ??
          "Confirm the proposed Xero treatment before generating final files.");
    return {
      title: scope.displayName!,
      target: proposedTreatment,
      reason: businessReason,
      proposedTreatment,
      businessReason,
      requiredAction,
      confidenceClassification: mappingConfidence({
        automatic,
        confidence: (scope.confidencePercentage ?? 0) / 100,
        effort:
          scope.disposition === "decision_required" &&
          scope.evidence.systemRoles.includes("fixed_asset")
            ? "Accountant Review"
            : "Manual Mapping",
      }),
      group: accountMappingGroup(scope),
      reviewStatus: automatic
        ? ("automatically_accepted" as const)
        : ("requires_review" as const),
    };
  });
  const otherDecisions: PublicMapping[] = assessment.decisions
    .filter((decision) => !representedDecisionKeys.has(decision.decisionKey))
    .map((decision) => {
      const title =
        decision.affectedRecords.map((record) => record.label).find(Boolean) ??
        decision.title;
      return {
        title,
        target: decision.recommendedAction,
        reason: decision.explanation,
        proposedTreatment: decision.recommendedAction,
        businessReason: decision.explanation,
        requiredAction: decision.recommendedAction,
        confidenceClassification: mappingConfidence({
          automatic: false,
          confidence: decision.confidence,
          effort: decision.estimatedEffort,
        }),
        group: decisionGroup(decision),
        reviewStatus: "requires_review" as const,
      };
    });
  const mappings = deduplicateMappings([...accountMappings, ...otherDecisions]);
  const manualReviewCount = mappings.filter(
    (mapping) => mapping.reviewStatus === "requires_review",
  ).length;
  const publicAssessment: PublicMigrationAssessment = {
    readiness: readinessState(assessment.overallStatus),
    executiveSummary: executiveSummary(assessment, manualReviewCount),
    scores: {
      financialHealth: assessment.scorecard.financialIntegrity.score,
      migrationReadiness: assessment.scorecard.migrationReadiness.score,
      manualReviewRequired: manualReviewCount,
    },
    summary: {
      primaryRecommendation: assessment.summary.primaryRecommendation,
      blockingIssueCount: assessment.summary.blockingIssueCount,
      actionRequiredCount: assessment.summary.actionRequiredCount,
      reviewItemCount: assessment.summary.reviewItemCount,
    },
    controls: assessment.controls.map((control) => ({
      title: control.title,
      status: control.status,
      statusLabel: controlStatusLabel(control.status),
      explanation: control.explanation,
      evidence: controlEvidence(control),
      businessImpact:
        controlBusinessImpactByCode[control.code] ??
        "This control contributes to confidence in the migration starting position.",
      difference: control.comparison.difference,
      currency: control.comparison.currency,
    })),
    recommendations: publicRecommendations(assessment),
    mappingReview: {
      automaticallyAccepted:
        assessment.accountScopeSummary?.autoMappedAccounts ?? 0,
      requiresReview: manualReviewCount,
      excludedUnused:
        assessment.accountScopeSummary?.excludedUnusedAccounts ?? 0,
      mappings,
    },
    nextSteps: [
      {
        sequence: 1,
        title: "Resolve accounting issues",
        description:
          "Correct failed financial controls and source-data issues in QuickBooks.",
        required:
          assessment.summary.blockingIssueCount > 0 ||
          assessment.summary.actionRequiredCount > 0,
      },
      {
        sequence: 2,
        title: "Confirm migration decisions",
        description:
          "Review only the account, tax, and tracking treatments that require judgement.",
        required: manualReviewCount > 0,
      },
      {
        sequence: 3,
        title: "Generate migration package",
        description:
          "Create the reviewed Xero-ready files and Financial Assessment.",
        required: true,
      },
      {
        sequence: 4,
        title: "Import into Xero Demo Organisation",
        description:
          "Test the migration package in a disposable Xero organisation.",
        required: true,
      },
      {
        sequence: 5,
        title: "Verify Trial Balance",
        description:
          "Compare the destination trial balance, receivables, payables, bank, tax, and equity totals.",
        required: true,
      },
      {
        sequence: 6,
        title: "Go Live",
        description:
          "Proceed only after destination balances reconcile to the source evidence.",
        required: true,
      },
    ],
    supportRecommended: assessment.findings.some(
      (finding) =>
        finding.fixLocation === "preconfin" &&
        (finding.issueClass === "product_limitation" ||
          finding.workflowImpact === "action_required" ||
          finding.workflowImpact === "blocks_workflow"),
    ),
  };
  return deepFreeze(publicAssessment) as PublicMigrationAssessment;
}

export function adaptFinancialAssessmentForMigrator(
  value: unknown,
): MigratorAssessmentAdapter {
  const assessment = financialAssessmentV1Schema.parse(value);
  return deepFreeze({
    assessment,
    migrationReadinessScore: assessment.scorecard.migrationReadiness.score,
    blockingFindings: assessment.findings.filter(
      (finding) => finding.workflowImpact === "blocks_workflow",
    ),
    decisionsRequired: assessment.decisions.filter(
      (decision) => decision.status === "open",
    ),
  }) as MigratorAssessmentAdapter;
}
