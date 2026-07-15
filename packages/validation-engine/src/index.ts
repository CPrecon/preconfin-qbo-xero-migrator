import type { AccountingSnapshot } from "@preconfin/canonical-model";
import {
  createFinancialAssessment,
  type AssessmentDecision,
  type AssessmentFinding,
  type AssessmentOverallStatus,
  type FinancialAssessmentV1,
} from "@preconfin/financial-assessment-engine";
import type { MigrationPlan } from "@preconfin/migration-engine";
import type {
  AffectedSourceRecord,
  ValidationFinding,
  ValidationReport,
  ValidationSeverity,
} from "./types.js";

function legacySeverity(
  severity: AssessmentFinding["severity"],
): ValidationSeverity {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "info";
}

function legacyReadiness(
  status: AssessmentOverallStatus,
): ValidationReport["summary"]["readiness"] {
  if (status === "blocked") return "blocked";
  if (
    status === "incomplete" ||
    status === "action_required" ||
    status === "review_recommended"
  ) {
    return "review_needed";
  }
  return "ready";
}

function affectedRecords(
  records: readonly {
    sourceId: string;
    sourceType: string;
    label?: string;
  }[],
): AffectedSourceRecord[] {
  return records.map((record) => ({
    sourceId: record.sourceId,
    sourceType: record.sourceType,
    label: record.label,
  }));
}

function legacyFinding(
  finding: AssessmentFinding,
  assessmentBlocked: boolean,
): ValidationFinding {
  const firstRecord = finding.affectedRecords[0];
  return {
    code: finding.ruleCode,
    severity: legacySeverity(finding.severity),
    title: finding.title,
    message: finding.explanation,
    recommendation: finding.recommendedAction,
    affectedRecords: affectedRecords(finding.affectedRecords),
    blocksExport:
      assessmentBlocked &&
      finding.issueClass === "financial_integrity" &&
      finding.workflowImpact === "blocks_workflow",
    entityType: firstRecord?.sourceType,
    entityId: firstRecord?.sourceId,
  };
}

function legacyDecision(decision: AssessmentDecision): ValidationFinding {
  const firstRecord = decision.affectedRecords[0];
  return {
    code: decision.decisionKey,
    severity:
      decision.workflowImpact === "action_required" ? "warning" : "info",
    title: decision.title,
    message: decision.explanation,
    recommendation: decision.recommendedAction,
    affectedRecords: affectedRecords(decision.affectedRecords),
    blocksExport: false,
    entityType: firstRecord?.sourceType,
    entityId: firstRecord?.sourceId,
  };
}

/**
 * Compatibility projection for existing PDF and ZIP renderers.
 * Findings, controls, scores, and status are never recomputed here.
 */
export function toLegacyValidationReport(
  assessment: FinancialAssessmentV1,
): ValidationReport {
  const findings = [
    ...assessment.findings.map((finding) =>
      legacyFinding(finding, assessment.overallStatus === "blocked"),
    ),
    ...assessment.decisions.map(legacyDecision),
  ];
  const errorCount = findings.filter(
    (finding) => finding.severity === "error",
  ).length;
  const warningCount = findings.filter(
    (finding) => finding.severity === "warning",
  ).length;
  const infoCount = findings.filter(
    (finding) => finding.severity === "info",
  ).length;

  return {
    summary: {
      score: assessment.scorecard.migrationReadiness.score,
      readiness: legacyReadiness(assessment.overallStatus),
      errorCount,
      warningCount,
      infoCount,
      generatedAt: assessment.generatedAt,
    },
    findings,
    recommendations:
      assessment.recommendations.length > 0
        ? assessment.recommendations.map(
            (recommendation) => recommendation.action,
          )
        : [assessment.summary.primaryRecommendation],
  };
}

/**
 * @deprecated Create FinancialAssessmentV1 directly in production paths.
 * This function remains for compatibility with existing package consumers.
 */
export function validateMigration(
  snapshot: AccountingSnapshot,
  plan: MigrationPlan,
): ValidationReport {
  return toLegacyValidationReport(
    createFinancialAssessment({
      snapshot,
      plan,
      assessmentType: "migration_readiness",
      generatedAt: plan.generatedAt,
    }),
  );
}

export type {
  AffectedSourceRecord,
  ValidationFinding,
  ValidationReport,
  ValidationSeverity,
  ValidationSummary,
} from "./types.js";
