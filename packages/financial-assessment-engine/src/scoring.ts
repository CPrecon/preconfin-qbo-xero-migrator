import type {
  AssessmentDecision,
  AssessmentFinding,
  AssessmentOverallStatus,
  AssessmentType,
  FinancialControl,
  FinancialScorecard,
  ScoreDimension,
  VerificationEvidence,
} from "./types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function controlValue(control: FinancialControl): number | null {
  if (control.status === "passed") return 100;
  if (control.status === "warning") return 70;
  if (control.status === "failed") return 0;
  return null;
}

function controlAverage(
  controls: readonly FinancialControl[],
  codes: readonly string[],
): number {
  const applicable = controls.filter(
    (control) =>
      codes.includes(control.code) && control.status !== "not_applicable",
  );
  if (!applicable.length) return 0;
  return clamp(
    applicable.reduce(
      (total, control) => total + (controlValue(control) ?? 0),
      0,
    ) / applicable.length,
  );
}

function findingPenalty(
  findings: readonly AssessmentFinding[],
  predicate: (finding: AssessmentFinding) => boolean,
): number {
  return findings.filter(predicate).reduce((total, finding) => {
    if (finding.severity === "critical") return total + 30;
    if (finding.severity === "high") return total + 15;
    if (finding.severity === "medium") return total + 6;
    if (finding.severity === "low") return total + 2;
    return total;
  }, 0);
}

function dimension(
  code: ScoreDimension["code"],
  label: string,
  score: number,
  explanation: string,
): ScoreDimension {
  return { code, label, score: clamp(score), explanation };
}

function migrationControlPenalty(
  controls: readonly FinancialControl[],
): number {
  const penalty = controls.reduce((total, control) => {
    if (control.blockingGate && control.status === "failed") {
      return total + 15;
    }
    if (control.blockingGate && control.status === "unavailable") {
      return total + 10;
    }
    if (!control.blockingGate && control.status === "failed") {
      return total + 8;
    }
    if (control.status === "warning") return total + 4;
    return total;
  }, 0);
  return Math.min(45, penalty);
}

export function calculateScorecard(
  controls: readonly FinancialControl[],
  findings: readonly AssessmentFinding[],
  decisions: readonly AssessmentDecision[],
): FinancialScorecard {
  const financialControlScore = controlAverage(controls, [
    "CONTROL_TRIAL_BALANCE",
    "CONTROL_RETAINED_EARNINGS",
    "CONTROL_OPENING_BALANCES",
    "CONTROL_CLOSING_BALANCES",
    "CONTROL_TAX_LIABILITY",
  ]);
  const financialPenalty = Math.min(
    40,
    findingPenalty(
      findings,
      (finding) => finding.issueClass === "financial_integrity",
    ),
  );
  const financialIntegrity = clamp(financialControlScore - financialPenalty);

  const reconciliation = controlAverage(controls, [
    "CONTROL_TRIAL_BALANCE",
    "CONTROL_ACCOUNTS_RECEIVABLE",
    "CONTROL_ACCOUNTS_PAYABLE",
    "CONTROL_BANK_RECONCILIATION",
    "CONTROL_RETAINED_EARNINGS",
  ]);

  const migrationIssuePenalty = Math.min(
    35,
    findingPenalty(
      findings,
      (finding) =>
        finding.workflowImpact === "blocks_workflow" ||
        finding.workflowImpact === "action_required",
    ),
  );
  const controlPenalty = migrationControlPenalty(controls);
  const decisionPenalty = Math.min(30, decisions.length * 3);
  const migrationReadiness = clamp(
    100 - controlPenalty - migrationIssuePenalty - decisionPenalty,
  );

  const dataQuality = clamp(
    100 -
      Math.min(
        80,
        findingPenalty(
          findings,
          (finding) => finding.issueClass === "source_data_quality",
        ),
      ),
  );

  const evidenceControl = controls.find(
    (control) => control.code === "CONTROL_EVIDENCE_COVERAGE",
  );
  const evidenceCoverage = clamp(evidenceControl?.coverage.percentage ?? 0);

  return {
    financialIntegrity: dimension(
      "financial_integrity",
      "Financial Integrity",
      financialIntegrity,
      "Measures deterministic agreement of core financial totals and controls.",
    ),
    reconciliation: dimension(
      "reconciliation",
      "Reconciliation",
      reconciliation,
      "Measures agreement across trial balance, receivables, payables, banking, and retained earnings controls.",
    ),
    migrationReadiness: dimension(
      "migration_readiness",
      "Migration Readiness",
      migrationReadiness,
      "Measures whether blocking issues and migration decisions have been resolved.",
    ),
    dataQuality: dimension(
      "data_quality",
      "Data Quality",
      dataQuality,
      "Measures source-record completeness, references, duplicates, and transaction quality.",
    ),
    evidenceCoverage: dimension(
      "evidence_coverage",
      "Evidence Coverage",
      evidenceCoverage,
      "Measures stable source lineage available for assessed records.",
    ),
  };
}

function hasBlockingFailure(
  controls: readonly FinancialControl[],
  findings: readonly AssessmentFinding[],
): boolean {
  return (
    controls.some(
      (control) => control.blockingGate && control.status === "failed",
    ) ||
    findings.some((finding) => finding.workflowImpact === "blocks_workflow")
  );
}

function hasIncompleteRequiredControl(
  controls: readonly FinancialControl[],
): boolean {
  return controls.some(
    (control) => control.blockingGate && control.status === "unavailable",
  );
}

function verificationIsSufficient(
  controls: readonly FinancialControl[],
  findings: readonly AssessmentFinding[],
  decisions: readonly AssessmentDecision[],
  verification?: VerificationEvidence,
): boolean {
  if (
    !verification?.evidence.some(
      (evidence) => evidence.evidenceType === "reconciliation",
    )
  ) {
    return false;
  }
  return (
    controls
      .filter((control) => control.status !== "not_applicable")
      .every((control) => control.status === "passed") &&
    findings.length === 0 &&
    decisions.length === 0
  );
}

export function deriveOverallStatus(
  controls: readonly FinancialControl[],
  findings: readonly AssessmentFinding[],
  decisions: readonly AssessmentDecision[],
  verification?: VerificationEvidence,
): AssessmentOverallStatus {
  if (hasBlockingFailure(controls, findings)) return "blocked";
  if (hasIncompleteRequiredControl(controls)) return "incomplete";
  if (
    controls.some((control) => control.status === "failed") ||
    findings.some((finding) => finding.workflowImpact === "action_required") ||
    decisions.some((decision) => decision.workflowImpact === "action_required")
  )
    return "action_required";
  if (
    controls.some((control) => control.status === "warning") ||
    findings.some((finding) => finding.workflowImpact === "review_required") ||
    decisions.length > 0
  )
    return "review_recommended";
  if (verificationIsSufficient(controls, findings, decisions, verification))
    return "verified";
  return "migration_ready";
}

export function primaryRecommendation(
  status: AssessmentOverallStatus,
  assessmentType: AssessmentType,
): string {
  const migrationAssessment =
    assessmentType === "migration_readiness" ||
    assessmentType === "post_migration_reconciliation";
  if (status === "blocked")
    return "Resolve failed financial controls before continuing.";
  if (status === "incomplete")
    return "Complete the missing source reports and rerun the assessment.";
  if (status === "action_required")
    return "Resolve the required source-data actions and regenerate the assessment.";
  if (status === "review_recommended")
    return migrationAssessment
      ? "Review the remaining migration decisions before generating final files."
      : "Review the remaining findings before relying on the assessment.";
  if (status === "verified")
    return "The assessment is verified by deterministic destination evidence.";
  return migrationAssessment
    ? "The books are ready for a controlled Xero migration review."
    : "The assessed books passed the required deterministic controls.";
}
