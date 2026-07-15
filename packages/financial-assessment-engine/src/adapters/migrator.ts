import { financialAssessmentV1Schema } from "../schema.js";
import { deepFreeze } from "../stable.js";
import type {
  AssessmentDecision,
  AssessmentFinding,
  FinancialAssessmentV1,
} from "../types.js";

export interface MigratorAssessmentAdapter {
  readonly assessment: FinancialAssessmentV1;
  readonly migrationReadinessScore: number;
  readonly blockingFindings: readonly AssessmentFinding[];
  readonly decisionsRequired: readonly AssessmentDecision[];
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
