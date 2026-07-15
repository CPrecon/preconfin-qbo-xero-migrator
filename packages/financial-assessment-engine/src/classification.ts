import type { AccountingSnapshot } from "@preconfin/canonical-model";
import type { MappingResult, MigrationPlan } from "@preconfin/migration-engine";
import type {
  AffectedSourceRecord,
  RuleFinding,
  RuleSeverity,
} from "./rule-types.js";
import { sortedUnique, stableId } from "./stable.js";
import type {
  ActionOwner,
  AssessmentAffectedRecord,
  AssessmentDecision,
  AssessmentEvidence,
  AssessmentFinding,
  EstimatedEffort,
  FindingCategory,
  FindingIssueClass,
  FindingSeverity,
  FixLocation,
  WorkflowImpact,
} from "./types.js";

export const ASSESSMENT_RULE_VERSION = "1.0.0";

export const CONTROL_OWNED_RULE_CODES = new Set([
  "MISSING_TRIAL_BALANCE",
  "TRIAL_BALANCE_NOT_ZERO",
  "AR_AGING_MISMATCH",
  "AR_AGING_UNAVAILABLE",
  "AP_AGING_MISMATCH",
  "AP_AGING_UNAVAILABLE",
  "OPENING_BALANCES_UNAVAILABLE",
  "RETAINED_EARNINGS_REVIEW",
]);

const financialIntegrityCodes = new Set([
  "INVOICE_TOTAL_MISMATCH",
  "BILL_TOTAL_MISMATCH",
  "CREDIT_TOTAL_MISMATCH",
  "UNBALANCED_JOURNAL",
  "PAYMENT_ALLOCATION_EXCEEDS_TOTAL",
]);

const migrationDecisionCodes = new Set([
  "UNSUPPORTED_ACCOUNT_TYPE",
  "MISSING_ACCOUNT_CODE_MAPPING",
  "INVALID_XERO_ACCOUNT_CODE",
  "DUPLICATE_XERO_ACCOUNT_CODE",
  "MISSING_TAX_MAPPING",
  "XERO_TRACKING_CATEGORY_LIMIT",
  "XERO_TRACKING_OPTION_LIMIT",
  "LINE_TRACKING_LIMIT",
  "UNSUPPORTED_INVENTORY_ITEM",
]);

const productLimitationCodes = new Set(["LARGE_TRANSACTION_COUNT"]);

export interface RuleClassification {
  issueClass: FindingIssueClass;
  category: FindingCategory;
}

export function classifyRuleCode(code: string): RuleClassification {
  if (financialIntegrityCodes.has(code)) {
    return {
      issueClass: "financial_integrity",
      category: code.includes("PAYMENT")
        ? "reconciliation"
        : "transaction_quality",
    };
  }
  if (migrationDecisionCodes.has(code)) {
    return {
      issueClass: "migration_decision",
      category: code.includes("TAX") ? "tax" : "migration_mapping",
    };
  }
  if (productLimitationCodes.has(code)) {
    return {
      issueClass: "product_limitation",
      category: "system_coverage",
    };
  }
  if (code.includes("CURRENCY")) {
    return {
      issueClass: "source_data_quality",
      category: "financial_integrity",
    };
  }
  if (code.includes("TAX")) {
    return { issueClass: "source_data_quality", category: "tax" };
  }
  if (code.includes("ACCOUNT")) {
    return {
      issueClass: "source_data_quality",
      category: "chart_of_accounts",
    };
  }
  if (code.includes("CUSTOMER")) {
    return { issueClass: "source_data_quality", category: "customers" };
  }
  if (code.includes("SUPPLIER") || code.includes("VENDOR")) {
    return { issueClass: "source_data_quality", category: "vendors" };
  }
  if (
    code.includes("INVOICE") ||
    code.includes("BILL") ||
    code.includes("CREDIT") ||
    code.includes("JOURNAL") ||
    code.includes("PAYMENT") ||
    code.includes("ITEM")
  ) {
    return {
      issueClass: "source_data_quality",
      category: "transaction_quality",
    };
  }
  if (code.includes("DATE")) {
    return {
      issueClass: "source_data_quality",
      category: "transaction_quality",
    };
  }
  if (code.startsWith("DUPLICATE_CONTACT")) {
    return { issueClass: "source_data_quality", category: "customers" };
  }
  if (code.startsWith("DUPLICATE_")) {
    return {
      issueClass: "source_data_quality",
      category: "transaction_quality",
    };
  }
  return { issueClass: "information", category: "informational" };
}

function severityFromRule(severity: RuleSeverity): FindingSeverity {
  if (severity === "error") return "high";
  if (severity === "warning") return "medium";
  if (severity === "info") return "low";
  return "informational";
}

function sourceRecord(record: AffectedSourceRecord): AssessmentAffectedRecord {
  return {
    sourceSystem: "quickbooks-online",
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    label: record.label,
  };
}

function evidenceFromRecord(
  record: AssessmentAffectedRecord,
): AssessmentEvidence {
  return {
    evidenceId: stableId(
      "evidence",
      record.sourceSystem,
      record.sourceType,
      record.sourceId,
    ),
    evidenceType: "source_record",
    sourceSystem: record.sourceSystem,
    sourceRecordId: record.sourceId,
    label: record.label ?? record.sourceType,
  };
}

function ruleEvidence(code: string): AssessmentEvidence {
  return {
    evidenceId: stableId("evidence", "rule", code),
    evidenceType: "rule_signal",
    sourceSystem: "preconfin",
    label: "Deterministic rule " + code,
  };
}

function rootCauseFamily(code: string): string {
  if (
    code === "MISSING_ACCOUNT_REFERENCE" ||
    code === "INVALID_ACCOUNT_REFERENCE"
  )
    return "ACCOUNT_REFERENCE";
  if (
    code === "MISSING_CUSTOMER_REFERENCE" ||
    code === "MISSING_SUPPLIER_REFERENCE" ||
    code === "MISSING_CREDIT_CONTACT_REFERENCE"
  )
    return "CONTACT_REFERENCE";
  if (code === "INVALID_TAX_REFERENCE" || code === "MISSING_TAX_MAPPING")
    return "TAX_MAPPING";
  if (code.includes("INVOICE_TOTAL")) return "INVOICE_TOTAL";
  if (code.includes("BILL_TOTAL")) return "BILL_TOTAL";
  if (code.includes("CREDIT_TOTAL")) return "CREDIT_TOTAL";
  return code;
}

function affectedScope(
  finding: RuleFinding,
  records: readonly AssessmentAffectedRecord[],
): string {
  if (finding.entityId)
    return (finding.entityType ?? "entity") + ":" + finding.entityId;
  if (records.length)
    return records
      .map(
        (record) =>
          record.sourceSystem + ":" + record.sourceType + ":" + record.sourceId,
      )
      .sort()
      .join("|");
  return "global";
}

function businessImpact(issueClass: FindingIssueClass): string {
  if (issueClass === "financial_integrity")
    return "Financial totals or allocations may be unreliable until this is resolved.";
  if (issueClass === "source_data_quality")
    return "Affected records may not migrate or reconcile cleanly.";
  if (issueClass === "migration_decision")
    return "The migration cannot be finalized until the target treatment is confirmed.";
  if (issueClass === "product_limitation")
    return "Assessment coverage is limited for this part of the source data.";
  return "This item provides context for the assessment.";
}

function fixLocation(issueClass: FindingIssueClass): FixLocation {
  if (issueClass === "financial_integrity") return "quickbooks";
  if (issueClass === "source_data_quality") return "quickbooks";
  if (issueClass === "migration_decision") return "xero";
  if (issueClass === "product_limitation") return "preconfin";
  return "none";
}

function owner(issueClass: FindingIssueClass): ActionOwner {
  if (issueClass === "financial_integrity") return "accountant";
  if (issueClass === "source_data_quality") return "bookkeeper";
  if (issueClass === "migration_decision") return "migration_specialist";
  if (issueClass === "product_limitation") return "preconfin";
  return "business_owner";
}

function effort(issueClass: FindingIssueClass): EstimatedEffort {
  if (issueClass === "financial_integrity") return "Accountant Review";
  if (issueClass === "source_data_quality") return "Source System Change";
  if (issueClass === "migration_decision") return "Manual Mapping";
  return "Quick Review";
}

function workflowImpact(
  issueClass: FindingIssueClass,
  severity: FindingSeverity,
): WorkflowImpact {
  if (
    issueClass === "financial_integrity" &&
    (severity === "critical" || severity === "high")
  )
    return "blocks_workflow";
  if (
    severity === "critical" ||
    severity === "high" ||
    issueClass === "migration_decision"
  )
    return "action_required";
  if (severity === "medium" || severity === "low") return "review_required";
  return "none";
}

interface ClassifiedRule {
  finding: RuleFinding;
  classification: RuleClassification;
  records: AssessmentAffectedRecord[];
  evidence: AssessmentEvidence[];
  rootKey: string;
}

function classifyRule(finding: RuleFinding): ClassifiedRule {
  const classification = classifyRuleCode(finding.code);
  const records = finding.affectedRecords
    .map(sourceRecord)
    .sort((left, right) =>
      (left.sourceSystem + left.sourceType + left.sourceId).localeCompare(
        right.sourceSystem + right.sourceType + right.sourceId,
      ),
    );
  const rootKey = stableId(
    "issue",
    rootCauseFamily(finding.code),
    affectedScope(finding, records),
  );
  return {
    finding,
    classification,
    records,
    evidence: [...records.map(evidenceFromRecord), ruleEvidence(finding.code)],
    rootKey,
  };
}

function severityRank(severity: FindingSeverity): number {
  return {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    informational: 1,
  }[severity];
}

function uniqueRecords(
  records: readonly AssessmentAffectedRecord[],
): AssessmentAffectedRecord[] {
  return [
    ...new Map(
      records.map((record) => [
        record.sourceSystem + ":" + record.sourceType + ":" + record.sourceId,
        record,
      ]),
    ).values(),
  ].sort((left, right) =>
    (left.sourceType + left.sourceId).localeCompare(
      right.sourceType + right.sourceId,
    ),
  );
}

function uniqueEvidence(
  evidence: readonly AssessmentEvidence[],
): AssessmentEvidence[] {
  return [
    ...new Map(evidence.map((item) => [item.evidenceId, item])).values(),
  ].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
}

export function buildAssessmentFindings(
  ruleFindings: readonly RuleFinding[],
  periodKey: string,
): AssessmentFinding[] {
  const grouped = new Map<string, ClassifiedRule[]>();
  for (const ruleFinding of ruleFindings) {
    if (CONTROL_OWNED_RULE_CODES.has(ruleFinding.code)) continue;
    const classified = classifyRule(ruleFinding);
    if (classified.classification.issueClass === "migration_decision") continue;
    grouped.set(classified.rootKey, [
      ...(grouped.get(classified.rootKey) ?? []),
      classified,
    ]);
  }

  return [...grouped.entries()]
    .map(([issueKey, group]) => {
      const primary = [...group].sort((left, right) => {
        const severityOrder =
          severityRank(severityFromRule(right.finding.severity)) -
          severityRank(severityFromRule(left.finding.severity));
        return (
          severityOrder || left.finding.code.localeCompare(right.finding.code)
        );
      })[0]!;
      const issueClass = primary.classification.issueClass;
      if (issueClass === "migration_decision")
        throw new Error("Migration decisions cannot be emitted as findings");
      const severity = severityFromRule(primary.finding.severity);
      return {
        issueKey,
        occurrenceId: stableId("occurrence", issueKey, periodKey),
        ruleCode: primary.finding.code,
        category: primary.classification.category,
        issueClass,
        severity,
        title: primary.finding.title,
        businessImpact: businessImpact(issueClass),
        explanation: primary.finding.message,
        affectedRecords: uniqueRecords(group.flatMap((item) => item.records)),
        evidence: uniqueEvidence(group.flatMap((item) => item.evidence)),
        recommendedAction: primary.finding.recommendation,
        fixLocation: fixLocation(issueClass),
        owner: owner(issueClass),
        workflowImpact: workflowImpact(issueClass, severity),
        confidence: 1,
        ruleVersion: ASSESSMENT_RULE_VERSION,
        status: "open" as const,
        resolutionEvidence: [],
        estimatedEffort: effort(issueClass),
      };
    })
    .sort((left, right) => left.issueKey.localeCompare(right.issueKey));
}

function decisionKind(code: string): string {
  if (code.includes("ACCOUNT")) return "account";
  if (code.includes("TAX")) return "tax";
  if (code.includes("TRACKING")) return "tracking";
  if (code.includes("INVENTORY") || code.includes("ITEM")) return "item";
  return rootCauseFamily(code).toLowerCase();
}

function decisionFromRule(
  classified: ClassifiedRule,
  periodKey: string,
): AssessmentDecision {
  const mappingIds = classified.finding.entityId
    ? [classified.finding.entityId]
    : [];
  const decisionKey = stableId(
    "decision",
    decisionKind(classified.finding.code),
    mappingIds,
  );
  return {
    decisionKey,
    occurrenceId: stableId("occurrence", decisionKey, periodKey),
    category: "migration_mapping",
    issueClass: "migration_decision",
    title: classified.finding.title,
    explanation: classified.finding.message,
    businessImpact: businessImpact("migration_decision"),
    recommendedAction: classified.finding.recommendation,
    affectedRecords: classified.records,
    evidence: classified.evidence,
    owner: "migration_specialist",
    fixLocation: "xero",
    workflowImpact:
      classified.finding.severity === "error"
        ? "action_required"
        : "review_required",
    confidence: 1,
    ruleVersion: ASSESSMENT_RULE_VERSION,
    status: "open",
    resolutionEvidence: [],
    estimatedEffort:
      classified.finding.severity === "error"
        ? "Accountant Review"
        : "Manual Mapping",
  };
}

function mappedRecord(
  snapshot: AccountingSnapshot,
  mapping: MappingResult,
): AssessmentAffectedRecord[] {
  const account = snapshot.accounts.find(
    (candidate) => candidate.id === mapping.sourceId,
  );
  if (account) {
    return [
      {
        sourceSystem: account.source.sourceSystem,
        sourceType: account.source.sourceType,
        sourceId: account.source.sourceId,
        label: account.name,
      },
    ];
  }
  const tax = (snapshot.taxCodes ?? snapshot.taxRates).find(
    (candidate) => candidate.id === mapping.sourceId,
  );
  if (tax) {
    return [
      {
        sourceSystem: tax.source.sourceSystem,
        sourceType: tax.source.sourceType,
        sourceId: tax.source.sourceId,
        label: tax.name,
      },
    ];
  }
  return [];
}

function mappingDecision(input: {
  kind: string;
  title: string;
  explanation: string;
  action: string;
  mappingIds: readonly string[];
  records: readonly AssessmentAffectedRecord[];
  periodKey: string;
  confidence: number;
  effort: AssessmentDecision["estimatedEffort"];
}): AssessmentDecision {
  const decisionKey = stableId(
    "decision",
    input.kind,
    [...input.mappingIds].sort(),
  );
  const evidence = uniqueEvidence([
    ...input.records.map(evidenceFromRecord),
    ruleEvidence("MAPPING_" + input.kind.toUpperCase()),
  ]);
  return {
    decisionKey,
    occurrenceId: stableId("occurrence", decisionKey, input.periodKey),
    category: "migration_mapping",
    issueClass: "migration_decision",
    title: input.title,
    explanation: input.explanation,
    businessImpact: businessImpact("migration_decision"),
    recommendedAction: input.action,
    affectedRecords: uniqueRecords(input.records),
    evidence,
    owner: "migration_specialist",
    fixLocation: "xero",
    workflowImpact: "review_required",
    confidence: input.confidence,
    ruleVersion: ASSESSMENT_RULE_VERSION,
    status: "open",
    resolutionEvidence: [],
    estimatedEffort: input.effort,
  };
}

const decisionEffortRank: Record<
  AssessmentDecision["estimatedEffort"],
  number
> = {
  "Quick Review": 1,
  "Manual Mapping": 2,
  "Accountant Review": 3,
};

function mergedDecisionTitle(
  left: AssessmentDecision,
  right: AssessmentDecision,
): string {
  if (left.title === right.title) return left.title;
  if (
    [...left.affectedRecords, ...right.affectedRecords].some(
      (record) => record.sourceType === "account",
    )
  ) {
    return "Confirm account mapping";
  }
  if (
    left.title.toLowerCase().includes("tracking") ||
    right.title.toLowerCase().includes("tracking")
  ) {
    return "Confirm tracking categories";
  }
  return "Confirm migration decision";
}

function mergeDecision(
  existing: AssessmentDecision,
  incoming: AssessmentDecision,
): AssessmentDecision {
  const estimatedEffort =
    decisionEffortRank[existing.estimatedEffort] >=
    decisionEffortRank[incoming.estimatedEffort]
      ? existing.estimatedEffort
      : incoming.estimatedEffort;
  return {
    ...existing,
    title: mergedDecisionTitle(existing, incoming),
    explanation: sortedUnique([
      existing.explanation,
      incoming.explanation,
    ]).join(" "),
    recommendedAction: sortedUnique([
      existing.recommendedAction,
      incoming.recommendedAction,
    ]).join(" "),
    affectedRecords: uniqueRecords([
      ...existing.affectedRecords,
      ...incoming.affectedRecords,
    ]),
    evidence: uniqueEvidence([...existing.evidence, ...incoming.evidence]),
    workflowImpact:
      existing.workflowImpact === "action_required" ||
      incoming.workflowImpact === "action_required"
        ? "action_required"
        : "review_required",
    confidence: Math.min(existing.confidence, incoming.confidence),
    estimatedEffort,
  };
}

export function buildAssessmentDecisions(
  ruleFindings: readonly RuleFinding[],
  snapshot: AccountingSnapshot,
  plan: MigrationPlan | undefined,
  periodKey: string,
): AssessmentDecision[] {
  const decisions: AssessmentDecision[] = ruleFindings
    .filter(
      (finding) =>
        classifyRuleCode(finding.code).issueClass === "migration_decision",
    )
    .map((finding) => decisionFromRule(classifyRule(finding), periodKey));

  if (!plan) {
    return decisions.sort((left, right) =>
      left.decisionKey.localeCompare(right.decisionKey),
    );
  }

  const accountScopeById = new Map(
    (plan.accountScope ?? []).map((scope) => [scope.sourceId, scope]),
  );
  for (const mapping of plan.accountMappings) {
    const account = snapshot.accounts.find(
      (candidate) => candidate.id === mapping.sourceId,
    );
    const normalizedType = String(account?.sourceAccountType ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const normalizedSubtype = String(account?.sourceAccountSubType ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const accountScope = accountScopeById.get(mapping.sourceId);
    const requiresTreatment = accountScope
      ? accountScope.disposition === "decision_required"
      : mapping.confidence !== "high" ||
        normalizedType === "creditcard" ||
        normalizedType === "fixedasset" ||
        normalizedSubtype === "accumulateddepreciation";
    if (!requiresTreatment) continue;
    decisions.push(
      mappingDecision({
        kind: "account",
        title: "Confirm account treatment",
        explanation: [
          mapping.rationale ??
            mapping.sourceName +
              " has a suggested Xero type of " +
              mapping.targetType +
              ".",
          accountScope?.decisionReason,
        ]
          .filter(Boolean)
          .join(" "),
        action:
          "Confirm the account type and code before generating final import files.",
        mappingIds: [mapping.sourceId],
        records: mappedRecord(snapshot, mapping),
        periodKey,
        confidence:
          mapping.confidencePercentage !== undefined
            ? mapping.confidencePercentage / 100
            : mapping.confidence === "low"
              ? 0.5
              : mapping.confidence === "medium"
                ? 0.75
                : 0.9,
        effort:
          normalizedType === "fixedasset"
            ? "Accountant Review"
            : "Manual Mapping",
      }),
    );
  }

  for (const mapping of plan.taxMappings) {
    decisions.push(
      mappingDecision({
        kind: "tax",
        title: "Confirm Xero tax mapping",
        explanation:
          mapping.sourceName +
          " requires confirmation against an available Xero tax rate.",
        action:
          "Choose the destination Xero tax rate before importing affected transactions.",
        mappingIds: [mapping.sourceId],
        records: mappedRecord(snapshot, mapping),
        periodKey,
        confidence:
          mapping.confidencePercentage !== undefined
            ? mapping.confidencePercentage / 100
            : 0.75,
        effort: "Manual Mapping",
      }),
    );
  }

  if (plan.trackingMappings.length) {
    decisions.push(
      mappingDecision({
        kind: "tracking",
        title: "Confirm tracking categories",
        explanation:
          "QuickBooks classes and locations need a confirmed Xero tracking-category design.",
        action:
          "Choose up to two Xero tracking categories and confirm their options.",
        mappingIds: [],
        records: [],
        periodKey,
        confidence: 0.75,
        effort: "Manual Mapping",
      }),
    );
  }

  const byKey = new Map<string, AssessmentDecision>();
  for (const decision of decisions) {
    const existing = byKey.get(decision.decisionKey);
    if (!existing) {
      byKey.set(decision.decisionKey, decision);
      continue;
    }
    byKey.set(decision.decisionKey, mergeDecision(existing, decision));
  }
  return [...byKey.values()].sort((left, right) =>
    left.decisionKey.localeCompare(right.decisionKey),
  );
}

export function ruleVersions(
  ruleFindings: readonly RuleFinding[],
): Record<string, string> {
  return Object.fromEntries(
    sortedUnique(ruleFindings.map((finding) => finding.code)).map((code) => [
      code,
      ASSESSMENT_RULE_VERSION,
    ]),
  );
}
