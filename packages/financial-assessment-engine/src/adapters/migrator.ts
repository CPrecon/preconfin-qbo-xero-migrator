import { financialAssessmentV1Schema } from "../schema.js";
import { deepFreeze } from "../stable.js";
import type {
  AssessmentDecision,
  AssessmentFinding,
  AssessmentOverallStatus,
  ControlStatus,
  ExpectedCompletionTime,
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

export interface PublicMigrationAssessment {
  readonly readiness: {
    readonly state: PublicMigrationReadinessState;
    readonly label:
      "Ready" | "Ready with Review" | "Needs Attention" | "Blocked";
    readonly explanation: string;
  };
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
    readonly explanation: string;
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
      readonly confidencePercentage: number;
      readonly reason: string;
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
  const mappedAccountSourceIds = new Set(
    relevantAccountScope.map((scope) => scope.sourceId),
  );
  const accountMappings = relevantAccountScope.map((scope) => ({
    title: scope.displayName!,
    target:
      [
        scope.targetCode,
        scope.targetName,
        scope.targetType ? `(${scope.targetType})` : undefined,
      ]
        .filter(Boolean)
        .join(" ") || `Xero ${scope.targetType}`,
    confidencePercentage: scope.confidencePercentage ?? 0,
    reason: [
      scope.rationale ??
        "The mapping follows the deterministic account-type catalogue.",
      scope.disposition === "decision_required" && scope.decisionReason
        ? `Review required: ${scope.decisionReason}`
        : undefined,
    ]
      .filter(Boolean)
      .join(" "),
    reviewStatus:
      scope.reviewStatus ??
      (scope.disposition === "decision_required"
        ? ("requires_review" as const)
        : ("automatically_accepted" as const)),
  }));
  const otherDecisions = assessment.decisions
    .filter(
      (decision) =>
        !decision.affectedRecords.some(
          (record) =>
            record.sourceType === "account" &&
            mappedAccountSourceIds.has(record.sourceId),
        ),
    )
    .map((decision) => ({
      title:
        decision.affectedRecords.map((record) => record.label).find(Boolean) ??
        decision.title,
      target: decision.recommendedAction,
      confidencePercentage: Math.round(decision.confidence * 100),
      reason: decision.explanation,
      reviewStatus: "requires_review" as const,
    }));
  const mappings = [...accountMappings, ...otherDecisions].sort(
    (left, right) =>
      Number(left.reviewStatus === "automatically_accepted") -
        Number(right.reviewStatus === "automatically_accepted") ||
      left.title.localeCompare(right.title),
  );
  const publicAssessment: PublicMigrationAssessment = {
    readiness: readinessState(assessment.overallStatus),
    scores: {
      financialHealth: assessment.scorecard.financialIntegrity.score,
      migrationReadiness: assessment.scorecard.migrationReadiness.score,
      manualReviewRequired: assessment.decisions.length,
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
      explanation: control.explanation,
      difference: control.comparison.difference,
      currency: control.comparison.currency,
    })),
    recommendations: assessment.recommendations.map((recommendation) => ({
      priority: recommendation.priority,
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
    })),
    mappingReview: {
      automaticallyAccepted:
        assessment.accountScopeSummary?.autoMappedAccounts ?? 0,
      requiresReview: mappings.filter(
        (mapping) => mapping.reviewStatus === "requires_review",
      ).length,
      excludedUnused:
        assessment.accountScopeSummary?.excludedUnusedAccounts ?? 0,
      mappings,
    },
    nextSteps: assessment.nextSteps.map((step) => ({
      sequence: step.sequence,
      title: step.title,
      description: step.description,
      required: step.required,
    })),
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
