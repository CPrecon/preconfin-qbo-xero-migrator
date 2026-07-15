import { classifyRuleCode } from "./classification.js";
import type {
  AssessmentDecision,
  AssessmentFinding,
  FinancialAssessmentV1,
  FinancialControl,
  FindingIssueClass,
} from "./types.js";

export type CertificationDisposition =
  | "Removed"
  | "Merged"
  | "Reclassified"
  | "Downgraded"
  | "Upgraded"
  | "Still Valid"
  | "New";

export interface LegacyCertificationFinding {
  readonly code: string;
  readonly severity?: string;
  readonly title?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly affectedRecords?: readonly {
    readonly sourceType?: string;
    readonly sourceId?: string;
  }[];
}

export interface LegacyCertificationReport {
  readonly summary?: {
    readonly score?: number;
    readonly readiness?: string;
    readonly errorCount?: number;
    readonly warningCount?: number;
    readonly infoCount?: number;
  };
  readonly findings?: readonly LegacyCertificationFinding[];
}

export interface CertificationDispositionRow {
  readonly baselineReference: string;
  readonly legacyCode: string;
  readonly legacySeverity: string;
  readonly issueClass: FindingIssueClass;
  readonly disposition: Exclude<CertificationDisposition, "New">;
  readonly canonicalReference?: string;
  readonly deterministicReason: string;
  readonly manualReviewRequired: boolean;
}

export interface CertificationNewItem {
  readonly canonicalReference: string;
  readonly itemType: "control" | "finding" | "decision";
  readonly title: string;
  readonly issueClass: FindingIssueClass | "financial_control";
  readonly status: string;
  readonly deterministicReason: string;
}

export interface CertificationComparison {
  readonly baseline: {
    readonly score?: number;
    readonly readiness?: string;
    readonly occurrenceCount: number;
    readonly errorCount: number;
    readonly warningCount: number;
    readonly infoCount: number;
  };
  readonly assessment: FinancialAssessmentV1;
  readonly dispositions: readonly CertificationDispositionRow[];
  readonly newItems: readonly CertificationNewItem[];
  readonly dispositionCounts: Readonly<
    Record<CertificationDisposition, number>
  >;
  readonly duplicateOccurrenceReduction: number;
}

const controlByLegacyCode: Readonly<Record<string, string>> = {
  MISSING_TRIAL_BALANCE: "CONTROL_TRIAL_BALANCE",
  TRIAL_BALANCE_NOT_ZERO: "CONTROL_TRIAL_BALANCE",
  AR_AGING_MISMATCH: "CONTROL_ACCOUNTS_RECEIVABLE",
  AR_AGING_UNAVAILABLE: "CONTROL_ACCOUNTS_RECEIVABLE",
  AP_AGING_MISMATCH: "CONTROL_ACCOUNTS_PAYABLE",
  AP_AGING_UNAVAILABLE: "CONTROL_ACCOUNTS_PAYABLE",
  OPENING_BALANCES_UNAVAILABLE: "CONTROL_OPENING_BALANCES",
  RETAINED_EARNINGS_REVIEW: "CONTROL_RETAINED_EARNINGS",
};

const financialControlCodes = new Set([
  ...Object.keys(controlByLegacyCode),
  "UNBALANCED_JOURNAL",
  "INVOICE_TOTAL_MISMATCH",
  "BILL_TOTAL_MISMATCH",
  "CREDIT_TOTAL_MISMATCH",
  "PAYMENT_ALLOCATION_EXCEEDS_TOTAL",
]);

const correctedNormalizationReasons: Readonly<Record<string, string>> = {
  MISSING_ACCOUNT_REFERENCE:
    "The canonical model resolves a transaction account from the line first and then through ItemRef to the item's income or expense account.",
  INVALID_ACCOUNT_REFERENCE:
    "The canonical model validates the resolved line or item account against the extracted chart of accounts.",
  INVOICE_TOTAL_MISMATCH:
    "Invoice totals are compared on an equivalent basis after normalizing line amounts, tax, discounts, shipping, and bounded rounding.",
  BILL_TOTAL_MISMATCH:
    "Bill totals are compared on an equivalent basis after normalizing line amounts, tax, discounts, shipping, and bounded rounding.",
  CREDIT_TOTAL_MISMATCH:
    "Credit totals are compared after canonical line and sign normalization.",
  UNSUPPORTED_ACCOUNT_TYPE:
    "Standard QuickBooks account types and subtypes now use the deterministic QBO-to-Xero mapping catalogue.",
  MISSING_TAX_MAPPING:
    "Valid source tax references are normalized separately from the user's Xero tax-rate choice.",
  INVALID_TAX_REFERENCE:
    "Tax references are validated against normalized QuickBooks tax codes before migration mapping is considered.",
};

type CanonicalTargetKind = "control" | "finding" | "decision";

interface CanonicalTarget {
  readonly key: string;
  readonly reference: string;
  readonly kind: CanonicalTargetKind;
  readonly title: string;
  readonly signalCodes: readonly string[];
  readonly scopeTokens: readonly string[];
  readonly issueClass: FindingIssueClass | "financial_control";
  readonly severity?: string;
  readonly status: string;
  readonly control?: FinancialControl;
}

function countSeverity(
  findings: readonly LegacyCertificationFinding[],
  severity: string,
): number {
  return findings.filter(
    (finding) => finding.severity?.toLowerCase() === severity,
  ).length;
}

function issueClassForLegacy(code: string): FindingIssueClass {
  if (financialControlCodes.has(code)) return "financial_integrity";
  return classifyRuleCode(code).issueClass;
}

function sourceTokens(finding: LegacyCertificationFinding): readonly string[] {
  const tokens = new Set<string>();
  if (finding.entityId) {
    tokens.add(`${finding.entityType ?? "entity"}:${finding.entityId}`);
  }
  for (const record of finding.affectedRecords ?? []) {
    if (record.sourceId) {
      tokens.add(`${record.sourceType ?? "record"}:${record.sourceId}`);
    }
  }
  return [...tokens].sort();
}

function assessmentTokens(
  records: readonly {
    readonly sourceType: string;
    readonly sourceId: string;
  }[],
): readonly string[] {
  return records
    .map((record) => `${record.sourceType}:${record.sourceId}`)
    .sort();
}

function signalCodes(
  primaryCode: string | undefined,
  evidence: readonly { readonly label: string }[],
): readonly string[] {
  const codes = new Set<string>();
  if (primaryCode) codes.add(primaryCode);
  for (const item of evidence) {
    if (item.label.startsWith("Deterministic rule ")) {
      codes.add(item.label.slice("Deterministic rule ".length));
    }
  }
  return [...codes].sort();
}

function findingTarget(
  finding: AssessmentFinding,
  index: number,
): CanonicalTarget {
  return {
    key: finding.issueKey,
    reference: `F${String(index + 1).padStart(3, "0")}`,
    kind: "finding",
    title: finding.title,
    signalCodes: signalCodes(finding.ruleCode, finding.evidence),
    scopeTokens: assessmentTokens(finding.affectedRecords),
    issueClass: finding.issueClass,
    severity: finding.severity,
    status: finding.status,
  };
}

function decisionTarget(
  decision: AssessmentDecision,
  index: number,
): CanonicalTarget {
  return {
    key: decision.decisionKey,
    reference: `D${String(index + 1).padStart(3, "0")}`,
    kind: "decision",
    title: decision.title,
    signalCodes: signalCodes(undefined, decision.evidence),
    scopeTokens: assessmentTokens(decision.affectedRecords),
    issueClass: "migration_decision",
    status: decision.status,
  };
}

function controlTarget(
  control: FinancialControl,
  index: number,
): CanonicalTarget {
  return {
    key: control.code,
    reference: `C${String(index + 1).padStart(3, "0")}`,
    kind: "control",
    title: control.title,
    signalCodes: Object.entries(controlByLegacyCode)
      .filter(([, controlCode]) => controlCode === control.code)
      .map(([code]) => code)
      .sort(),
    scopeTokens: [],
    issueClass: "financial_control",
    status: control.status,
    control,
  };
}

function canonicalTargets(
  assessment: FinancialAssessmentV1,
): readonly CanonicalTarget[] {
  return [
    ...assessment.controls.map(controlTarget),
    ...assessment.findings.map(findingTarget),
    ...assessment.decisions.map(decisionTarget),
  ];
}

function scopeMatches(
  legacyTokens: readonly string[],
  targetTokens: readonly string[],
): boolean {
  if (!legacyTokens.length || !targetTokens.length) return true;
  const target = new Set(targetTokens);
  return legacyTokens.some((token) => target.has(token));
}

function matchingTarget(
  finding: LegacyCertificationFinding,
  targets: readonly CanonicalTarget[],
): CanonicalTarget | undefined {
  const controlCode = controlByLegacyCode[finding.code];
  if (controlCode) {
    return targets.find(
      (target) => target.kind === "control" && target.key === controlCode,
    );
  }
  const tokens = sourceTokens(finding);
  const candidates = targets
    .filter(
      (target) =>
        target.kind !== "control" &&
        target.signalCodes.includes(finding.code) &&
        scopeMatches(tokens, target.scopeTokens),
    )
    .sort((left, right) => left.key.localeCompare(right.key));
  return candidates[0];
}

function severityLevel(severity: string | undefined): number {
  const normalized = severity?.toLowerCase();
  if (normalized === "error" || normalized === "critical") return 3;
  if (normalized === "high") return 3;
  if (normalized === "warning" || normalized === "medium") return 2;
  if (
    normalized === "info" ||
    normalized === "low" ||
    normalized === "informational"
  )
    return 1;
  return 0;
}

function dispositionFor(
  legacy: LegacyCertificationFinding,
  target: CanonicalTarget | undefined,
  targetMatchCount: number,
): Exclude<CertificationDisposition, "New"> {
  if (!target) return "Removed";
  if (target.kind === "control" || target.kind === "decision") {
    return "Reclassified";
  }
  if (targetMatchCount > 1) return "Merged";
  const previous = severityLevel(legacy.severity);
  const current = severityLevel(target.severity);
  if (current < previous) return "Downgraded";
  if (current > previous) return "Upgraded";
  return "Still Valid";
}

function deterministicReason(
  legacy: LegacyCertificationFinding,
  target: CanonicalTarget | undefined,
  disposition: Exclude<CertificationDisposition, "New">,
  targetMatchCount: number,
): string {
  if (!target) {
    return (
      correctedNormalizationReasons[legacy.code] ??
      "The same rule and source scope did not reproduce after canonical normalization; source coverage and extraction timing require manual confirmation."
    );
  }
  if (target.kind === "control") {
    const control = target.control!;
    return `The legacy signal is represented once by the ${control.title} control. Its ${control.status} result is determined from source comparison, tolerance, period, basis, and ${control.coverage.percentage}% control coverage.`;
  }
  if (target.kind === "decision") {
    return `This signal is not treated as an accounting defect. It is represented as the migration decision "${target.title}" and affects Migration Readiness only.`;
  }
  if (disposition === "Merged") {
    return `${targetMatchCount} legacy occurrences resolve to one canonical root cause with aggregated affected records and evidence.`;
  }
  if (disposition === "Downgraded") {
    return `The same deterministic signal remains, but canonical classification and workflow impact support a lower severity of ${target.severity}.`;
  }
  if (disposition === "Upgraded") {
    return `The same deterministic signal remains and canonical blocking or business-impact rules require a higher severity of ${target.severity}.`;
  }
  return "The same deterministic rule signal remains for the matching source scope with evidence retained under one canonical root cause.";
}

function newItemReason(target: CanonicalTarget): string {
  if (target.kind === "control") {
    return `FinancialAssessmentV1 adds an explicit ${target.title} control with status ${target.status}; the legacy report had no equivalent visible result.`;
  }
  if (target.kind === "decision") {
    return "The canonical engine separates this migration choice from accounting and source-data findings.";
  }
  return "The canonical rule catalogue produced this root-cause finding for source evidence that had no matching legacy signal.";
}

function emptyDispositionCounts(): Record<CertificationDisposition, number> {
  return {
    Removed: 0,
    Merged: 0,
    Reclassified: 0,
    Downgraded: 0,
    Upgraded: 0,
    "Still Valid": 0,
    New: 0,
  };
}

export function createCertificationComparison(
  baseline: LegacyCertificationReport,
  assessment: FinancialAssessmentV1,
): CertificationComparison {
  const legacyFindings = baseline.findings ?? [];
  const targets = canonicalTargets(assessment);
  const matches = legacyFindings.map((finding) =>
    matchingTarget(finding, targets),
  );
  const targetMatchCounts = new Map<string, number>();
  for (const target of matches) {
    if (target) {
      targetMatchCounts.set(
        target.key,
        (targetMatchCounts.get(target.key) ?? 0) + 1,
      );
    }
  }

  const dispositions = legacyFindings.map((legacy, index) => {
    const target = matches[index];
    const matchCount = target ? (targetMatchCounts.get(target.key) ?? 1) : 0;
    const disposition = dispositionFor(legacy, target, matchCount);
    return {
      baselineReference: `L${String(index + 1).padStart(3, "0")}`,
      legacyCode: legacy.code,
      legacySeverity: legacy.severity ?? "unknown",
      issueClass: issueClassForLegacy(legacy.code),
      disposition,
      canonicalReference: target?.reference,
      deterministicReason: deterministicReason(
        legacy,
        target,
        disposition,
        matchCount,
      ),
      manualReviewRequired:
        disposition === "Removed" &&
        correctedNormalizationReasons[legacy.code] === undefined,
    } satisfies CertificationDispositionRow;
  });

  const matchedTargetKeys = new Set(
    matches
      .filter((target): target is CanonicalTarget => Boolean(target))
      .map((target) => target.key),
  );
  const newTargets = targets.filter((target) => {
    if (matchedTargetKeys.has(target.key)) return false;
    if (target.kind !== "control") return true;
    return !["passed", "not_applicable"].includes(target.status);
  });
  const newItems = newTargets.map(
    (target) =>
      ({
        canonicalReference: target.reference,
        itemType: target.kind,
        title: target.title,
        issueClass: target.issueClass,
        status: target.status,
        deterministicReason: newItemReason(target),
      }) satisfies CertificationNewItem,
  );

  const dispositionCounts = emptyDispositionCounts();
  for (const row of dispositions) {
    dispositionCounts[row.disposition] += 1;
  }
  dispositionCounts.New = newItems.length;

  const duplicateOccurrenceReduction = [...targetMatchCounts.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );

  return {
    baseline: {
      score: baseline.summary?.score,
      readiness: baseline.summary?.readiness,
      occurrenceCount: legacyFindings.length,
      errorCount:
        baseline.summary?.errorCount ?? countSeverity(legacyFindings, "error"),
      warningCount:
        baseline.summary?.warningCount ??
        countSeverity(legacyFindings, "warning"),
      infoCount:
        baseline.summary?.infoCount ?? countSeverity(legacyFindings, "info"),
    },
    assessment,
    dispositions,
    newItems,
    dispositionCounts,
    duplicateOccurrenceReduction,
  };
}

function markdown(value: string | number | undefined): string {
  if (value === undefined) return "Not available";
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderCertificationMarkdown(
  comparison: CertificationComparison,
): string {
  const { assessment, baseline } = comparison;
  const lines = [
    "# Financial Assessment Certification Comparison",
    "",
    "This sanitized comparison excludes company names, balances, source record identifiers, transaction descriptions, and credentials.",
    "",
    "## Summary",
    "",
    "| Measure | Historic baseline | FinancialAssessmentV1 |",
    "| --- | ---: | ---: |",
    `| Overall score | ${markdown(baseline.score)} | Status is not score-derived |`,
    `| Overall status | ${markdown(baseline.readiness)} | ${assessment.overallStatus} |`,
    `| Finding occurrences | ${baseline.occurrenceCount} | ${assessment.findings.length} |`,
    `| Separate migration decisions | Mixed into findings | ${assessment.decisions.length} |`,
    `| Duplicate occurrences merged | Not available | ${comparison.duplicateOccurrenceReduction} |`,
    `| Assessment coverage | Not reported | ${assessment.assessmentCoverage.percentage}% |`,
    "",
    "## Scorecard",
    "",
    "| Dimension | Score |",
    "| --- | ---: |",
    `| Financial Integrity | ${assessment.scorecard.financialIntegrity.score} |`,
    `| Reconciliation | ${assessment.scorecard.reconciliation.score} |`,
    `| Migration Readiness | ${assessment.scorecard.migrationReadiness.score} |`,
    `| Data Quality | ${assessment.scorecard.dataQuality.score} |`,
    `| Evidence Coverage | ${assessment.scorecard.evidenceCoverage.score} |`,
    "",
    "## Disposition Counts",
    "",
    "| Disposition | Count |",
    "| --- | ---: |",
    ...Object.entries(comparison.dispositionCounts).map(
      ([disposition, count]) => `| ${disposition} | ${count} |`,
    ),
    "",
    "## Every Historic Finding",
    "",
    "| Ref | Legacy code | Severity | Approved class | Disposition | Canonical ref | Deterministic reason | Review |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...comparison.dispositions.map(
      (row) =>
        `| ${row.baselineReference} | ${markdown(row.legacyCode)} | ${markdown(row.legacySeverity)} | ${row.issueClass} | ${row.disposition} | ${row.canonicalReference ?? "None"} | ${markdown(row.deterministicReason)} | ${row.manualReviewRequired ? "Required" : "Not required"} |`,
    ),
    "",
    "## New Canonical Items",
    "",
  ];

  if (!comparison.newItems.length) {
    lines.push(
      "No new canonical controls, findings, or decisions require attention.",
    );
  } else {
    lines.push(
      "| Ref | Type | Title | Class | Status | Deterministic reason |",
      "| --- | --- | --- | --- | --- | --- |",
      ...comparison.newItems.map(
        (item) =>
          `| ${item.canonicalReference} | ${item.itemType} | ${markdown(item.title)} | ${item.issueClass} | ${item.status} | ${markdown(item.deterministicReason)} |`,
      ),
    );
  }

  lines.push(
    "",
    "## Deterministic Controls",
    "",
    "| Control | Status | Coverage | Blocking |",
    "| --- | --- | ---: | --- |",
    ...assessment.controls.map(
      (control) =>
        `| ${markdown(control.title)} | ${control.status} | ${control.coverage.percentage}% | ${control.blockingGate ? "Yes" : "No"} |`,
    ),
    "",
    "## Gate",
    "",
    "- Confirm both artifacts represent the same QuickBooks company, reporting basis, and materially equivalent scope.",
    "- Review every removed item marked as requiring manual review.",
    "- Review every failed or unavailable blocking control against its evidence.",
    "- Do not begin renderer work until an authorized reviewer records a certification decision.",
    "",
  );
  return lines.join("\n");
}
