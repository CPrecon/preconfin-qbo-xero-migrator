import { z } from "zod";
import {
  FINANCIAL_ASSESSMENT_REPORT_VERSION,
  type FinancialAssessmentV1,
} from "./types.js";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTimeSchema = z.string().datetime({ offset: true });
const scoreSchema = z.number().int().min(0).max(100);
const percentageSchema = z.number().min(0).max(100);

const assessmentTypeSchema = z.enum([
  "financial_health",
  "migration_readiness",
  "post_migration_reconciliation",
  "year_end_review",
  "bookkeeping_health",
  "due_diligence",
  "continuous_monitoring",
]);

const overallStatusSchema = z.enum([
  "blocked",
  "incomplete",
  "action_required",
  "review_recommended",
  "migration_ready",
  "verified",
]);

const basisSchema = z.enum(["cash", "accrual", "unknown"]);
const controlStatusSchema = z.enum([
  "passed",
  "warning",
  "failed",
  "unavailable",
  "not_applicable",
]);
const coverageStatusSchema = z.enum([
  "complete",
  "partial",
  "unavailable",
  "not_applicable",
]);
const categorySchema = z.enum([
  "financial_integrity",
  "reconciliation",
  "receivables",
  "payables",
  "banking",
  "chart_of_accounts",
  "transaction_quality",
  "vendors",
  "customers",
  "tax",
  "evidence",
  "migration_mapping",
  "system_coverage",
  "informational",
]);
const findingClassSchema = z.enum([
  "financial_integrity",
  "source_data_quality",
  "product_limitation",
  "information",
]);
const severitySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
  "informational",
]);
const findingStatusSchema = z.enum([
  "open",
  "acknowledged",
  "resolved",
  "accepted",
]);
const fixLocationSchema = z.enum([
  "quickbooks",
  "xero",
  "preconfin",
  "source_system",
  "accountant",
  "none",
]);
const ownerSchema = z.enum([
  "business_owner",
  "bookkeeper",
  "accountant",
  "preconfin",
  "migration_specialist",
  "system",
]);
const workflowImpactSchema = z.enum([
  "blocks_workflow",
  "action_required",
  "review_required",
  "none",
]);
const effortSchema = z.enum([
  "Quick Review",
  "Source System Change",
  "Manual Mapping",
  "Accountant Review",
]);

const periodSchema = z
  .object({
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema,
    label: z.string().min(1).optional(),
  })
  .strict();

const evidenceSchema = z
  .object({
    evidenceId: z.string().min(1),
    evidenceType: z.enum([
      "source_record",
      "report",
      "control",
      "rule_signal",
      "document",
      "reconciliation",
    ]),
    sourceSystem: z.string().min(1),
    label: z.string().min(1),
    sourceRecordId: z.string().min(1).optional(),
    observedAt: isoDateTimeSchema.optional(),
  })
  .strict();

const affectedRecordSchema = z
  .object({
    sourceSystem: z.string().min(1),
    sourceType: z.string().min(1),
    sourceId: z.string().min(1),
    label: z.string().min(1).optional(),
  })
  .strict();

const controlSchema = z
  .object({
    code: z.string().min(1),
    version: z.string().min(1),
    title: z.string().min(1),
    status: controlStatusSchema,
    explanation: z.string().min(1),
    comparison: z
      .object({
        sourceLabel: z.string().min(1),
        sourceValue: z.number().finite().nullable(),
        comparisonLabel: z.string().min(1),
        comparisonValue: z.number().finite().nullable(),
        difference: z.number().finite().nullable(),
        currency: z.string().length(3),
      })
      .strict(),
    tolerance: z.number().finite().min(0),
    period: periodSchema,
    basis: basisSchema,
    coverage: z
      .object({
        status: coverageStatusSchema,
        percentage: percentageSchema,
        explanation: z.string().min(1),
      })
      .strict(),
    blockingGate: z.boolean(),
    evidence: z.array(evidenceSchema),
  })
  .strict();

const findingSchema = z
  .object({
    issueKey: z.string().min(1),
    occurrenceId: z.string().min(1),
    ruleCode: z.string().min(1),
    category: categorySchema,
    issueClass: findingClassSchema,
    severity: severitySchema,
    title: z.string().min(1),
    businessImpact: z.string().min(1),
    explanation: z.string().min(1),
    affectedRecords: z.array(affectedRecordSchema),
    evidence: z.array(evidenceSchema),
    recommendedAction: z.string().min(1),
    fixLocation: fixLocationSchema,
    owner: ownerSchema,
    workflowImpact: workflowImpactSchema,
    confidence: z.number().min(0).max(1),
    ruleVersion: z.string().min(1),
    status: findingStatusSchema,
    resolutionEvidence: z.array(evidenceSchema),
    estimatedEffort: effortSchema,
  })
  .strict();

const decisionSchema = z
  .object({
    decisionKey: z.string().min(1),
    occurrenceId: z.string().min(1),
    category: z.literal("migration_mapping"),
    issueClass: z.literal("migration_decision"),
    title: z.string().min(1),
    explanation: z.string().min(1),
    businessImpact: z.string().min(1),
    recommendedAction: z.string().min(1),
    affectedRecords: z.array(affectedRecordSchema),
    evidence: z.array(evidenceSchema),
    owner: ownerSchema,
    fixLocation: fixLocationSchema,
    workflowImpact: z.enum(["action_required", "review_required"]),
    confidence: z.number().min(0).max(1),
    ruleVersion: z.string().min(1),
    status: findingStatusSchema,
    resolutionEvidence: z.array(evidenceSchema),
    estimatedEffort: z.enum([
      "Quick Review",
      "Manual Mapping",
      "Accountant Review",
    ]),
  })
  .strict();

const scoreDimensionSchema = z
  .object({
    code: z.enum([
      "financial_integrity",
      "reconciliation",
      "migration_readiness",
      "data_quality",
      "evidence_coverage",
    ]),
    label: z.string().min(1),
    score: scoreSchema,
    explanation: z.string().min(1),
  })
  .strict();

const accountScopeSummarySchema = z
  .object({
    totalAccounts: z.number().int().min(0),
    relevantAccounts: z.number().int().min(0),
    autoMappedAccounts: z.number().int().min(0),
    decisionRequiredAccounts: z.number().int().min(0),
    excludedUnusedAccounts: z.number().int().min(0),
  })
  .strict();

const accountScopeEvidenceSchema = z
  .object({
    openingBalance: z.number().finite(),
    conversionBalance: z.number().finite(),
    closingBalance: z.number().finite(),
    periodDebitActivity: z.number().finite().min(0),
    periodCreditActivity: z.number().finite().min(0),
    transactionCount: z.number().int().min(0),
    openDocumentReferenceCount: z.number().int().min(0),
    itemReferenceCount: z.number().int().min(0),
    taxDependencyCount: z.number().int().min(0),
    exportedRecordReferenceCount: z.number().int().min(0),
    unresolvedRelationshipCount: z.number().int().min(0),
    systemRoles: z.array(z.string().min(1)),
    active: z.boolean(),
    tolerance: z.number().finite().min(0),
  })
  .strict();

const accountScopeSchema = z
  .object({
    sourceId: z.string().min(1),
    disposition: z.enum([
      "auto_mapped",
      "decision_required",
      "excluded_unused_account",
    ]),
    relevanceReasons: z.array(
      z.enum([
        "non_zero_opening_balance",
        "non_zero_conversion_balance",
        "non_zero_closing_balance",
        "period_activity",
        "open_document_dependency",
        "item_dependency",
        "tax_dependency",
        "exported_record_dependency",
        "required_system_account",
        "unresolved_relationship",
      ]),
    ),
    decisionReason: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
    targetType: z.string().min(1).optional(),
    targetCode: z.string().min(1).optional(),
    targetName: z.string().min(1).optional(),
    confidencePercentage: percentageSchema.optional(),
    rationale: z.string().min(1).optional(),
    reviewStatus: z
      .enum(["automatically_accepted", "requires_review"])
      .optional(),
    evidence: accountScopeEvidenceSchema,
  })
  .strict();

export const financialAssessmentV1Schema: z.ZodType<FinancialAssessmentV1> = z
  .object({
    identity: z
      .object({
        reportId: z.string().min(1),
        assessmentKey: z.string().min(1),
        organizationId: z.string().min(1),
      })
      .strict(),
    organization: z
      .object({
        id: z.string().min(1),
        displayName: z.string().min(1),
        legalName: z.string().min(1).optional(),
      })
      .strict(),
    assessmentType: assessmentTypeSchema,
    generatedAt: isoDateTimeSchema,
    period: periodSchema,
    basis: basisSchema,
    currency: z.string().length(3),
    sourceSystems: z.array(
      z
        .object({
          system: z.string().min(1),
          recordCount: z.number().int().min(0),
          pulledAt: isoDateTimeSchema.optional(),
          status: z.enum(["available", "partial", "unavailable"]),
        })
        .strict(),
    ),
    assessmentCoverage: z
      .object({
        percentage: percentageSchema,
        availableControlCount: z.number().int().min(0),
        applicableControlCount: z.number().int().min(0),
        unavailableControlCodes: z.array(z.string().min(1)),
        sourceRecordCount: z.number().int().min(0),
        sourceRecordWithLineageCount: z.number().int().min(0),
      })
      .strict(),
    accountScopeSummary: accountScopeSummarySchema.optional(),
    accountScope: z.array(accountScopeSchema).optional(),
    overallStatus: overallStatusSchema,
    scorecard: z
      .object({
        financialIntegrity: scoreDimensionSchema,
        reconciliation: scoreDimensionSchema,
        migrationReadiness: scoreDimensionSchema,
        dataQuality: scoreDimensionSchema,
        evidenceCoverage: scoreDimensionSchema,
      })
      .strict(),
    summary: z
      .object({
        primaryRecommendation: z.string().min(1),
        blockingIssueCount: z.number().int().min(0),
        actionRequiredCount: z.number().int().min(0),
        reviewItemCount: z.number().int().min(0),
        informationalCount: z.number().int().min(0),
        decisionCount: z.number().int().min(0),
        passedControlCount: z.number().int().min(0),
        failedControlCount: z.number().int().min(0),
        unavailableControlCount: z.number().int().min(0),
      })
      .strict(),
    controls: z.array(controlSchema),
    findingGroups: z.array(
      z
        .object({
          code: z.enum([
            "resolve_in_source",
            "resolve_in_preconfin",
            "review_supporting_evidence",
            "optional_cleanup",
          ]),
          title: z.string().min(1),
          issueKeys: z.array(z.string().min(1)),
          count: z.number().int().min(0),
        })
        .strict(),
    ),
    findings: z.array(findingSchema),
    decisions: z.array(decisionSchema),
    recommendations: z.array(
      z
        .object({
          code: z.string().min(1),
          priority: z.number().int().min(1),
          title: z.string().min(1),
          action: z.string().min(1),
          reason: z.string().min(1),
          relatedIssueKeys: z.array(z.string().min(1)),
          estimatedEffort: effortSchema,
          fixLocation: fixLocationSchema,
          businessImpact: z.string().min(1).optional(),
          expectedCompletionTime: z
            .enum([
              "2-5 minutes",
              "5-15 minutes",
              "15-30 minutes",
              "15-60 minutes",
            ])
            .optional(),
        })
        .strict(),
    ),
    nextSteps: z.array(
      z
        .object({
          sequence: z.number().int().min(1),
          code: z.string().min(1),
          title: z.string().min(1),
          description: z.string().min(1),
          required: z.boolean(),
          dependsOn: z.array(z.string().min(1)),
        })
        .strict(),
    ),
    evidenceSummary: z
      .object({
        evidenceReferenceCount: z.number().int().min(0),
        findingWithEvidenceCount: z.number().int().min(0),
        findingCount: z.number().int().min(0),
        coveragePercentage: percentageSchema,
        sourceSystems: z.array(z.string().min(1)),
      })
      .strict(),
    verificationEvidence: z
      .object({
        verifiedAt: isoDateTimeSchema,
        destinationSystem: z.string().min(1),
        evidence: z.array(evidenceSchema).min(1),
      })
      .strict()
      .optional(),
    lineage: z
      .object({
        snapshotPulledAt: isoDateTimeSchema,
        normalizationVersion: z.string().min(1),
        assessmentEngineVersion: z.string().min(1),
        inputFingerprint: z.string().min(1),
        sourceRecordCounts: z.record(z.number().int().min(0)),
        generatedFrom: z.array(z.string().min(1)),
      })
      .strict(),
    ruleVersions: z.record(z.string().min(1)),
    reportVersion: z.literal(FINANCIAL_ASSESSMENT_REPORT_VERSION),
  })
  .strict();

export function parseFinancialAssessmentV1(
  value: unknown,
): FinancialAssessmentV1 {
  return financialAssessmentV1Schema.parse(value);
}
