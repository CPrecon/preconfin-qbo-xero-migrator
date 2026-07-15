import { financialAssessmentV1Schema } from "../schema.js";
import { deepFreeze } from "../stable.js";
import type {
  AssessmentEvidence,
  AssessmentFinding,
  FinancialAssessmentV1,
  FinancialControl,
} from "../types.js";

export interface AuditorAssessmentAdapter {
  readonly assessment: FinancialAssessmentV1;
  readonly controlsByCode: Readonly<Record<string, FinancialControl>>;
  readonly openFindings: readonly AssessmentFinding[];
  readonly evidenceById: Readonly<Record<string, AssessmentEvidence>>;
}

export function adaptFinancialAssessmentForAuditor(
  value: unknown,
): AuditorAssessmentAdapter {
  const assessment = financialAssessmentV1Schema.parse(value);
  const controlsByCode = Object.fromEntries(
    assessment.controls.map((control) => [control.code, control]),
  );
  const openFindings = assessment.findings.filter(
    (finding) => finding.status === "open",
  );
  const evidenceById = Object.fromEntries(
    [
      ...assessment.controls.flatMap((control) => control.evidence),
      ...assessment.findings.flatMap((finding) => finding.evidence),
      ...assessment.decisions.flatMap((decision) => decision.evidence),
    ].map((evidence) => [evidence.evidenceId, evidence]),
  );
  return deepFreeze({
    assessment,
    controlsByCode,
    openFindings,
    evidenceById,
  }) as AuditorAssessmentAdapter;
}
