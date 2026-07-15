import type { AccountingSnapshot } from "@preconfin/canonical-model";
import type { MigrationPlan } from "@preconfin/migration-engine";
import {
  buildAssessmentDecisions,
  buildAssessmentFindings,
  ruleVersions,
} from "./classification.js";
import {
  assessmentBasis,
  assessmentPeriod,
  buildFinancialControls,
  CONTROL_RULE_VERSION,
} from "./controls.js";
import {
  buildAssessmentCoverage,
  buildEvidenceSummary,
  buildFindingGroups,
  buildNextSteps,
  buildRecommendations,
  buildSummary,
} from "./report-parts.js";
import { evaluateAssessmentRules } from "./rules.js";
import {
  calculateScorecard,
  deriveOverallStatus,
  primaryRecommendation,
} from "./scoring.js";
import { financialAssessmentV1Schema } from "./schema.js";
import { deepFreeze, stableFingerprint, stableId } from "./stable.js";
import {
  FINANCIAL_ASSESSMENT_ENGINE_VERSION,
  FINANCIAL_ASSESSMENT_REPORT_VERSION,
  type AssessmentType,
  type FinancialAssessmentV1,
  type VerificationEvidence,
} from "./types.js";

export interface FinancialAssessmentInput {
  readonly snapshot: AccountingSnapshot;
  readonly plan?: MigrationPlan;
  readonly assessmentType?: AssessmentType;
  readonly generatedAt: string;
  readonly verificationEvidence?: VerificationEvidence;
}

interface SourceCounts {
  counts: Record<string, number>;
  total: number;
  withLineage: number;
}

function sourceCounts(snapshot: AccountingSnapshot): SourceCounts {
  const collections: Array<ReadonlyArray<{ source?: { sourceId?: string } }>> =
    [
      [snapshot.organization],
      snapshot.accounts,
      snapshot.contacts,
      snapshot.items,
      snapshot.invoices,
      snapshot.bills,
      snapshot.payments,
      snapshot.credits,
      snapshot.journals,
      snapshot.taxRates,
      snapshot.taxCodes ?? [],
      snapshot.currencies,
      snapshot.tracking,
      snapshot.balances,
    ];
  const names = [
    "organization",
    "accounts",
    "contacts",
    "items",
    "invoices",
    "bills",
    "payments",
    "credits",
    "journals",
    "taxRates",
    "taxCodes",
    "currencies",
    "tracking",
    "balances",
  ];
  const counts = Object.fromEntries(
    collections.map((collection, index) => [names[index]!, collection.length]),
  );
  const records = collections.flat();
  return {
    counts,
    total: records.length,
    withLineage: records.filter((record) => record.source?.sourceId).length,
  };
}

function planFingerprint(plan?: MigrationPlan): unknown {
  if (!plan) return null;
  return {
    accountMappings: plan.accountMappings,
    taxMappings: plan.taxMappings,
    contactMappings: plan.contactMappings,
    itemMappings: plan.itemMappings,
    trackingMappings: plan.trackingMappings,
    exceptions: plan.exceptions,
  };
}

export function createFinancialAssessment(
  input: FinancialAssessmentInput,
): FinancialAssessmentV1 {
  if (!Number.isFinite(Date.parse(input.generatedAt))) {
    throw new Error(
      "Financial assessment generatedAt must be an ISO timestamp",
    );
  }

  const assessmentType = input.assessmentType ?? "migration_readiness";
  const requiresMigrationPlan =
    assessmentType === "migration_readiness" ||
    assessmentType === "post_migration_reconciliation";
  if (requiresMigrationPlan && !input.plan) {
    throw new Error(`${assessmentType} assessments require a migration plan`);
  }
  const assessmentPlan = requiresMigrationPlan ? input.plan : undefined;
  const period = assessmentPeriod(input.snapshot, input.generatedAt);
  const basis = assessmentBasis(input.snapshot);
  const rules = evaluateAssessmentRules(input.snapshot, assessmentPlan);
  const controls = buildFinancialControls(input.snapshot, input.generatedAt);
  const periodKey =
    (period.startDate ?? "") + ":" + period.endDate + ":" + basis;
  const findings = buildAssessmentFindings(rules, periodKey);
  const decisions = buildAssessmentDecisions(
    rules,
    input.snapshot,
    assessmentPlan,
    periodKey,
  );
  const scorecard = calculateScorecard(controls, findings, decisions);
  const overallStatus = deriveOverallStatus(
    controls,
    findings,
    decisions,
    input.verificationEvidence,
  );
  const recommendation = primaryRecommendation(overallStatus, assessmentType);
  const counts = sourceCounts(input.snapshot);
  const inputFingerprint = stableFingerprint({
    snapshot: input.snapshot,
    plan: planFingerprint(assessmentPlan),
    assessmentType,
    period,
    basis,
    verificationEvidence: input.verificationEvidence,
  });
  const assessmentKey = stableId(
    "assessment",
    input.snapshot.organization.id,
    assessmentType,
    periodKey,
  );
  const reportId = stableId(
    "report",
    assessmentKey,
    input.generatedAt,
    inputFingerprint,
  );
  const runtimeRuleVersions = {
    ...ruleVersions(rules),
    CONTROL_RULES: CONTROL_RULE_VERSION,
    ASSESSMENT_ENGINE: FINANCIAL_ASSESSMENT_ENGINE_VERSION,
  };

  const assessment: FinancialAssessmentV1 = {
    identity: {
      reportId,
      assessmentKey,
      organizationId: input.snapshot.organization.id,
    },
    organization: {
      id: input.snapshot.organization.id,
      displayName: input.snapshot.organization.displayName,
      legalName: input.snapshot.organization.legalName,
    },
    assessmentType,
    generatedAt: input.generatedAt,
    period,
    basis,
    currency: input.snapshot.organization.baseCurrency,
    sourceSystems: [
      {
        system: "quickbooks-online",
        recordCount: counts.total,
        pulledAt: input.snapshot.pulledAt,
        status: counts.total > 1 ? "available" : "partial",
      },
      ...(input.verificationEvidence
        ? [
            {
              system: input.verificationEvidence.destinationSystem,
              recordCount: input.verificationEvidence.evidence.length,
              pulledAt: input.verificationEvidence.verifiedAt,
              status: "available" as const,
            },
          ]
        : []),
    ],
    assessmentCoverage: buildAssessmentCoverage(
      controls,
      counts.total,
      counts.withLineage,
    ),
    overallStatus,
    scorecard,
    summary: buildSummary(controls, findings, decisions, recommendation),
    controls,
    findingGroups: buildFindingGroups(findings),
    findings,
    decisions,
    recommendations: buildRecommendations(controls, findings, decisions),
    nextSteps: buildNextSteps(controls, findings, decisions),
    evidenceSummary: buildEvidenceSummary(
      controls,
      findings,
      decisions,
      input.verificationEvidence,
    ),
    verificationEvidence: input.verificationEvidence,
    lineage: {
      snapshotPulledAt: input.snapshot.pulledAt,
      normalizationVersion: "qbo-canonical-v1",
      assessmentEngineVersion: FINANCIAL_ASSESSMENT_ENGINE_VERSION,
      inputFingerprint,
      sourceRecordCounts: {
        ...counts.counts,
        ...(input.verificationEvidence
          ? {
              destinationEvidence: input.verificationEvidence.evidence.length,
            }
          : {}),
      },
      generatedFrom: [
        "canonical-accounting-snapshot",
        ...(assessmentPlan ? ["migration-plan"] : []),
        "deterministic-rule-catalogue",
        "financial-controls",
        ...(input.verificationEvidence
          ? ["destination-reconciliation-evidence"]
          : []),
      ],
    },
    ruleVersions: runtimeRuleVersions,
    reportVersion: FINANCIAL_ASSESSMENT_REPORT_VERSION,
  };

  return deepFreeze(
    financialAssessmentV1Schema.parse(assessment),
  ) as FinancialAssessmentV1;
}
