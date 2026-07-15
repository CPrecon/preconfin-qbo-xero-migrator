export const FINANCIAL_ASSESSMENT_REPORT_VERSION = "1.0.0" as const;
export const FINANCIAL_ASSESSMENT_ENGINE_VERSION = "1.0.0" as const;

export type AssessmentType =
  | "financial_health"
  | "migration_readiness"
  | "post_migration_reconciliation"
  | "year_end_review"
  | "bookkeeping_health"
  | "due_diligence"
  | "continuous_monitoring";

export type AssessmentOverallStatus =
  | "blocked"
  | "incomplete"
  | "action_required"
  | "review_recommended"
  | "migration_ready"
  | "verified";

export type AssessmentBasis = "cash" | "accrual" | "unknown";

export type ControlStatus =
  "passed" | "warning" | "failed" | "unavailable" | "not_applicable";

export type ControlCoverageStatus =
  "complete" | "partial" | "unavailable" | "not_applicable";

export type FindingIssueClass =
  | "financial_integrity"
  | "source_data_quality"
  | "migration_decision"
  | "product_limitation"
  | "information";

export type FindingCategory =
  | "financial_integrity"
  | "reconciliation"
  | "receivables"
  | "payables"
  | "banking"
  | "chart_of_accounts"
  | "transaction_quality"
  | "vendors"
  | "customers"
  | "tax"
  | "evidence"
  | "migration_mapping"
  | "system_coverage"
  | "informational";

export type FindingSeverity =
  "critical" | "high" | "medium" | "low" | "informational";

export type FindingStatus = "open" | "acknowledged" | "resolved" | "accepted";

export type FixLocation =
  "quickbooks" | "xero" | "preconfin" | "source_system" | "accountant" | "none";

export type ActionOwner =
  | "business_owner"
  | "bookkeeper"
  | "accountant"
  | "preconfin"
  | "migration_specialist"
  | "system";

export type WorkflowImpact =
  "blocks_workflow" | "action_required" | "review_required" | "none";

export type EstimatedEffort =
  | "Quick Review"
  | "Source System Change"
  | "Manual Mapping"
  | "Accountant Review";

export interface AssessmentIdentity {
  readonly reportId: string;
  readonly assessmentKey: string;
  readonly organizationId: string;
}

export interface AssessmentOrganization {
  readonly id: string;
  readonly displayName: string;
  readonly legalName?: string;
}

export interface AssessmentPeriod {
  readonly startDate?: string;
  readonly endDate: string;
  readonly label?: string;
}

export interface AssessmentSourceSystem {
  readonly system: string;
  readonly recordCount: number;
  readonly pulledAt?: string;
  readonly status: "available" | "partial" | "unavailable";
}

export interface AssessmentEvidence {
  readonly evidenceId: string;
  readonly evidenceType:
    | "source_record"
    | "report"
    | "control"
    | "rule_signal"
    | "document"
    | "reconciliation";
  readonly sourceSystem: string;
  readonly label: string;
  readonly sourceRecordId?: string;
  readonly observedAt?: string;
}

export interface AssessmentAffectedRecord {
  readonly sourceSystem: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly label?: string;
}

export interface FinancialControlComparison {
  readonly sourceLabel: string;
  readonly sourceValue: number | null;
  readonly comparisonLabel: string;
  readonly comparisonValue: number | null;
  readonly difference: number | null;
  readonly currency: string;
}

export interface FinancialControlCoverage {
  readonly status: ControlCoverageStatus;
  readonly percentage: number;
  readonly explanation: string;
}

export interface FinancialControl {
  readonly code: string;
  readonly version: string;
  readonly title: string;
  readonly status: ControlStatus;
  readonly explanation: string;
  readonly comparison: FinancialControlComparison;
  readonly tolerance: number;
  readonly period: AssessmentPeriod;
  readonly basis: AssessmentBasis;
  readonly coverage: FinancialControlCoverage;
  readonly blockingGate: boolean;
  readonly evidence: readonly AssessmentEvidence[];
}

export interface AssessmentFinding {
  readonly issueKey: string;
  readonly occurrenceId: string;
  readonly ruleCode: string;
  readonly category: FindingCategory;
  readonly issueClass: Exclude<FindingIssueClass, "migration_decision">;
  readonly severity: FindingSeverity;
  readonly title: string;
  readonly businessImpact: string;
  readonly explanation: string;
  readonly affectedRecords: readonly AssessmentAffectedRecord[];
  readonly evidence: readonly AssessmentEvidence[];
  readonly recommendedAction: string;
  readonly fixLocation: FixLocation;
  readonly owner: ActionOwner;
  readonly workflowImpact: WorkflowImpact;
  readonly confidence: number;
  readonly ruleVersion: string;
  readonly status: FindingStatus;
  readonly resolutionEvidence: readonly AssessmentEvidence[];
  readonly estimatedEffort: EstimatedEffort;
}

export interface AssessmentDecision {
  readonly decisionKey: string;
  readonly occurrenceId: string;
  readonly category: "migration_mapping";
  readonly issueClass: "migration_decision";
  readonly title: string;
  readonly explanation: string;
  readonly businessImpact: string;
  readonly recommendedAction: string;
  readonly affectedRecords: readonly AssessmentAffectedRecord[];
  readonly evidence: readonly AssessmentEvidence[];
  readonly owner: ActionOwner;
  readonly fixLocation: FixLocation;
  readonly workflowImpact: "action_required" | "review_required";
  readonly confidence: number;
  readonly ruleVersion: string;
  readonly status: FindingStatus;
  readonly resolutionEvidence: readonly AssessmentEvidence[];
  readonly estimatedEffort:
    "Quick Review" | "Manual Mapping" | "Accountant Review";
}

export interface FindingGroup {
  readonly code:
    | "resolve_in_source"
    | "resolve_in_preconfin"
    | "review_supporting_evidence"
    | "optional_cleanup";
  readonly title: string;
  readonly issueKeys: readonly string[];
  readonly count: number;
}

export interface ScoreDimension {
  readonly code:
    | "financial_integrity"
    | "reconciliation"
    | "migration_readiness"
    | "data_quality"
    | "evidence_coverage";
  readonly label: string;
  readonly score: number;
  readonly explanation: string;
}

export interface FinancialScorecard {
  readonly financialIntegrity: ScoreDimension;
  readonly reconciliation: ScoreDimension;
  readonly migrationReadiness: ScoreDimension;
  readonly dataQuality: ScoreDimension;
  readonly evidenceCoverage: ScoreDimension;
}

export interface AssessmentCoverage {
  readonly percentage: number;
  readonly availableControlCount: number;
  readonly applicableControlCount: number;
  readonly unavailableControlCodes: readonly string[];
  readonly sourceRecordCount: number;
  readonly sourceRecordWithLineageCount: number;
}

export interface AssessmentSummary {
  readonly primaryRecommendation: string;
  readonly blockingIssueCount: number;
  readonly actionRequiredCount: number;
  readonly reviewItemCount: number;
  readonly informationalCount: number;
  readonly decisionCount: number;
  readonly passedControlCount: number;
  readonly failedControlCount: number;
  readonly unavailableControlCount: number;
}

export interface AssessmentRecommendation {
  readonly code: string;
  readonly priority: number;
  readonly title: string;
  readonly action: string;
  readonly reason: string;
  readonly relatedIssueKeys: readonly string[];
  readonly estimatedEffort: EstimatedEffort;
  readonly fixLocation: FixLocation;
}

export interface AssessmentNextStep {
  readonly sequence: number;
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly required: boolean;
  readonly dependsOn: readonly string[];
}

export interface AssessmentEvidenceSummary {
  readonly evidenceReferenceCount: number;
  readonly findingWithEvidenceCount: number;
  readonly findingCount: number;
  readonly coveragePercentage: number;
  readonly sourceSystems: readonly string[];
}

export interface AssessmentLineage {
  readonly snapshotPulledAt: string;
  readonly normalizationVersion: string;
  readonly assessmentEngineVersion: string;
  readonly inputFingerprint: string;
  readonly sourceRecordCounts: Readonly<Record<string, number>>;
  readonly generatedFrom: readonly string[];
}

export interface VerificationEvidence {
  readonly verifiedAt: string;
  readonly destinationSystem: string;
  readonly evidence: readonly AssessmentEvidence[];
}

export interface FinancialAssessmentV1 {
  readonly identity: AssessmentIdentity;
  readonly organization: AssessmentOrganization;
  readonly assessmentType: AssessmentType;
  readonly generatedAt: string;
  readonly period: AssessmentPeriod;
  readonly basis: AssessmentBasis;
  readonly currency: string;
  readonly sourceSystems: readonly AssessmentSourceSystem[];
  readonly assessmentCoverage: AssessmentCoverage;
  readonly overallStatus: AssessmentOverallStatus;
  readonly scorecard: FinancialScorecard;
  readonly summary: AssessmentSummary;
  readonly controls: readonly FinancialControl[];
  readonly findingGroups: readonly FindingGroup[];
  readonly findings: readonly AssessmentFinding[];
  readonly decisions: readonly AssessmentDecision[];
  readonly recommendations: readonly AssessmentRecommendation[];
  readonly nextSteps: readonly AssessmentNextStep[];
  readonly evidenceSummary: AssessmentEvidenceSummary;
  readonly verificationEvidence?: VerificationEvidence;
  readonly lineage: AssessmentLineage;
  readonly ruleVersions: Readonly<Record<string, string>>;
  readonly reportVersion: typeof FINANCIAL_ASSESSMENT_REPORT_VERSION;
}
