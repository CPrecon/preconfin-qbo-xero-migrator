import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { classifyRuleCode } from "../src/classification.js";
import { parseFinancialAssessmentV1 } from "../src/index.js";
import type { FindingIssueClass } from "../src/types.js";

interface LegacyFinding {
  code: string;
  title?: string;
  entityType?: string;
  entityId?: string;
  affectedRecords?: Array<{
    sourceType?: string;
    sourceId?: string;
  }>;
}

interface LegacyReport {
  summary?: {
    score?: number;
    readiness?: string;
    errorCount?: number;
    warningCount?: number;
  };
  findings?: LegacyFinding[];
}

const controlByLegacyCode: Record<string, string> = {
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

function legacyClass(code: string): FindingIssueClass {
  if (financialControlCodes.has(code)) return "financial_integrity";
  return classifyRuleCode(code).issueClass;
}

function rootScope(finding: LegacyFinding): string {
  if (finding.entityId) {
    return `${finding.entityType ?? "entity"}:${finding.entityId}`;
  }
  const records = (finding.affectedRecords ?? [])
    .map(
      (record) =>
        `${record.sourceType ?? "record"}:${record.sourceId ?? "unknown"}`,
    )
    .sort();
  return records.length ? records.join("|") : "global";
}

function title(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function countByClass(findings: readonly LegacyFinding[]) {
  const counts = new Map<FindingIssueClass, number>();
  for (const finding of findings) {
    const issueClass = legacyClass(finding.code);
    counts.set(issueClass, (counts.get(issueClass) ?? 0) + 1);
  }
  return counts;
}

function valueOrUnknown(value: unknown): string {
  return value === undefined || value === null
    ? "Not available"
    : String(value);
}

async function main(): Promise<void> {
  const [baselinePath, assessmentPath] = process.argv.slice(2);
  if (!baselinePath || !assessmentPath) {
    throw new Error(
      "Usage: npm run baseline:compare -- <legacy-validation.json> <financial-assessment-v1.json>",
    );
  }

  const invocationRoot = process.env.INIT_CWD ?? process.cwd();
  const resolvedBaselinePath = resolve(invocationRoot, baselinePath);
  const resolvedAssessmentPath = resolve(invocationRoot, assessmentPath);

  const baseline = JSON.parse(
    await readFile(resolvedBaselinePath, "utf8"),
  ) as LegacyReport;
  const assessment = parseFinancialAssessmentV1(
    JSON.parse(await readFile(resolvedAssessmentPath, "utf8")),
  );
  const oldFindings = baseline.findings ?? [];
  const oldByRoot = new Map<string, LegacyFinding[]>();
  for (const finding of oldFindings) {
    const key = `${finding.code}|${rootScope(finding)}`;
    oldByRoot.set(key, [...(oldByRoot.get(key) ?? []), finding]);
  }

  const newSignalCodes = new Set([
    ...assessment.findings.map((finding) => finding.ruleCode),
    ...assessment.decisions.flatMap((decision) =>
      decision.evidence
        .map((evidence) =>
          evidence.label.startsWith("Deterministic rule ")
            ? evidence.label.slice("Deterministic rule ".length)
            : undefined,
        )
        .filter((code): code is string => Boolean(code)),
    ),
  ]);
  const controls = new Map(
    assessment.controls.map((control) => [control.code, control]),
  );
  const oldCodes = new Set(oldFindings.map((finding) => finding.code));
  const classCounts = countByClass(oldFindings);
  const removedCodes = [...oldCodes]
    .filter((code) => {
      const controlCode = controlByLegacyCode[code];
      return !newSignalCodes.has(code) && !controlCode;
    })
    .sort();
  const newCodes = [...newSignalCodes]
    .filter((code) => !oldCodes.has(code) && !code.startsWith("MAPPING_"))
    .sort();
  const duplicateOccurrenceCount = oldFindings.length - oldByRoot.size;

  const lines: string[] = [
    "# Financial Assessment Before/After",
    "",
    "This comparison contains counts, classifications, and control states only. It intentionally excludes company names, balances, source record values, and credentials.",
    "",
    "## Summary",
    "",
    "| Measure | Legacy baseline | FinancialAssessmentV1 |",
    "| --- | ---: | ---: |",
    `| Overall score | ${valueOrUnknown(baseline.summary?.score)} | Not used as a status gate |`,
    `| Overall status | ${valueOrUnknown(baseline.summary?.readiness)} | ${assessment.overallStatus} |`,
    `| Finding occurrences | ${oldFindings.length} | ${assessment.findings.length} |`,
    `| Root-cause findings | ${oldByRoot.size} | ${assessment.findings.length} |`,
    `| Separate migration decisions | Mixed into findings | ${assessment.decisions.length} |`,
    `| Duplicate occurrences removed | ${duplicateOccurrenceCount} | 0 |`,
    `| Assessment coverage | Not available | ${assessment.assessmentCoverage.percentage}% |`,
    "",
    "## Scorecard",
    "",
    "| Dimension | Legacy baseline | FinancialAssessmentV1 |",
    "| --- | ---: | ---: |",
    `| Financial Integrity | Not available | ${assessment.scorecard.financialIntegrity.score} |`,
    `| Reconciliation | Not available | ${assessment.scorecard.reconciliation.score} |`,
    `| Migration Readiness | ${valueOrUnknown(baseline.summary?.score)} | ${assessment.scorecard.migrationReadiness.score} |`,
    `| Data Quality | Not available | ${assessment.scorecard.dataQuality.score} |`,
    `| Evidence Coverage | Not available | ${assessment.scorecard.evidenceCoverage.score} |`,
    "",
    "## Baseline Classification",
    "",
    "| Class | Baseline occurrences |",
    "| --- | ---: |",
    `| Financial integrity | ${classCounts.get("financial_integrity") ?? 0} |`,
    `| Source data quality | ${classCounts.get("source_data_quality") ?? 0} |`,
    `| Migration decision | ${classCounts.get("migration_decision") ?? 0} |`,
    `| Product limitation | ${classCounts.get("product_limitation") ?? 0} |`,
    `| Information | ${classCounts.get("information") ?? 0} |`,
    "",
    "## Baseline Finding Disposition",
    "",
    "| Legacy code | Class | Occurrences | Corrected disposition |",
    "| --- | --- | ---: | --- |",
  ];

  const byCode = new Map<string, LegacyFinding[]>();
  for (const finding of oldFindings) {
    byCode.set(finding.code, [...(byCode.get(finding.code) ?? []), finding]);
  }
  for (const [code, findings] of [...byCode.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const controlCode = controlByLegacyCode[code];
    const control = controlCode ? controls.get(controlCode) : undefined;
    const issueClass = legacyClass(code);
    const disposition = control
      ? `Financial control: ${control!.status}`
      : newSignalCodes.has(code)
        ? issueClass === "migration_decision"
          ? "Separated as migration decision"
          : "Retained as one root-cause finding"
        : "Removed after corrected normalization or root-cause aggregation";
    lines.push(
      `| ${title(code)} | ${issueClass} | ${findings.length} | ${disposition} |`,
    );
  }

  lines.push(
    "",
    "## Deterministic Controls",
    "",
    "| Control | Status | Coverage | Blocking gate |",
    "| --- | --- | ---: | --- |",
    ...assessment.controls.map(
      (control) =>
        `| ${title(control.title)} | ${control.status} | ${control.coverage.percentage}% | ${control.blockingGate ? "Yes" : "No"} |`,
    ),
    "",
    "## Correctness Changes",
    "",
    `- Removed legacy codes after corrected normalization: ${removedCodes.length ? removedCodes.join(", ") : "None"}.`,
    `- New deterministic rule signals: ${newCodes.length ? newCodes.join(", ") : "None"}.`,
    `- Invoice account/total findings remaining: ${
      assessment.findings.filter((finding) =>
        ["MISSING_ACCOUNT_REFERENCE", "INVOICE_TOTAL_MISMATCH"].includes(
          finding.ruleCode,
        ),
      ).length
    }.`,
    `- Bill total findings remaining: ${
      assessment.findings.filter(
        (finding) => finding.ruleCode === "BILL_TOTAL_MISMATCH",
      ).length
    }.`,
    `- Account and tax mapping choices are represented as ${assessment.decisions.length} decisions, not accounting errors.`,
    "",
    "## Genuine Financial Discrepancies",
    "",
  );

  const failedControls = assessment.controls.filter(
    (control) => control.status === "failed",
  );
  if (!failedControls.length) {
    lines.push("- No deterministic financial control failed.");
  } else {
    for (const control of failedControls) {
      lines.push(
        `- ${control.title}: failed (difference withheld from this sanitized comparison).`,
      );
    }
  }

  lines.push(
    "",
    "## Gate",
    "",
    "- This output is valid only when both artifacts came from the same QBO company and extraction scope.",
    "- Review every removed finding against its aggregated evidence before labelling it a false positive.",
    "- Do not begin renderer/UI migration until this comparison is reviewed and approved.",
    "",
  );

  process.stdout.write(lines.join("\n"));
}

await main();
