import type {
  AccountingSnapshot,
  MoneyAmount,
  ReportValue,
} from "@preconfin/canonical-model";
import { stableId } from "./stable.js";
import type {
  AssessmentBasis,
  AssessmentEvidence,
  AssessmentPeriod,
  FinancialControl,
} from "./types.js";

export const CONTROL_RULE_VERSION = "1.0.0";

function round(value: number): number {
  return Number(value.toFixed(2));
}

function sum(values: readonly MoneyAmount[]): number {
  return round(values.reduce((total, value) => total + value.amount, 0));
}

function sumReport(values: readonly ReportValue[]): number {
  return sum(values.map((value) => value.amount));
}

function reportEvidence(
  code: string,
  title: string,
  observedAt?: string,
): AssessmentEvidence {
  return {
    evidenceId: stableId("evidence", code, title, observedAt ?? ""),
    evidenceType: "report",
    sourceSystem: "quickbooks-online",
    label: title,
    observedAt,
  };
}

function controlEvidence(
  code: string,
  title: string,
  observedAt?: string,
): AssessmentEvidence {
  return {
    evidenceId: stableId("evidence", code, title, observedAt ?? ""),
    evidenceType: "control",
    sourceSystem: "preconfin",
    label: title,
    observedAt,
  };
}

function unavailableControl(input: {
  code: string;
  title: string;
  explanation: string;
  sourceLabel: string;
  comparisonLabel: string;
  currency: string;
  period: AssessmentPeriod;
  basis: AssessmentBasis;
  blockingGate: boolean;
  evidence?: AssessmentEvidence[];
}): FinancialControl {
  return {
    code: input.code,
    version: CONTROL_RULE_VERSION,
    title: input.title,
    status: "unavailable",
    explanation: input.explanation,
    comparison: {
      sourceLabel: input.sourceLabel,
      sourceValue: null,
      comparisonLabel: input.comparisonLabel,
      comparisonValue: null,
      difference: null,
      currency: input.currency,
    },
    tolerance: 0,
    period: input.period,
    basis: input.basis,
    coverage: {
      status: "unavailable",
      percentage: 0,
      explanation: input.explanation,
    },
    blockingGate: input.blockingGate,
    evidence: input.evidence ?? [],
  };
}

function notApplicableControl(input: {
  code: string;
  title: string;
  explanation: string;
  currency: string;
  period: AssessmentPeriod;
  basis: AssessmentBasis;
}): FinancialControl {
  return {
    code: input.code,
    version: CONTROL_RULE_VERSION,
    title: input.title,
    status: "not_applicable",
    explanation: input.explanation,
    comparison: {
      sourceLabel: "Source total",
      sourceValue: null,
      comparisonLabel: "Comparison total",
      comparisonValue: null,
      difference: null,
      currency: input.currency,
    },
    tolerance: 0,
    period: input.period,
    basis: input.basis,
    coverage: {
      status: "not_applicable",
      percentage: 100,
      explanation: input.explanation,
    },
    blockingGate: false,
    evidence: [],
  };
}

function comparedControl(input: {
  code: string;
  title: string;
  explanationPassed: string;
  explanationFailed: string;
  sourceLabel: string;
  sourceValue: number;
  comparisonLabel: string;
  comparisonValue: number;
  tolerance: number;
  currency: string;
  period: AssessmentPeriod;
  basis: AssessmentBasis;
  blockingGate: boolean;
  warning?: boolean;
  coveragePercentage?: number;
  evidence: AssessmentEvidence[];
}): FinancialControl {
  const difference = round(input.sourceValue - input.comparisonValue);
  const withinTolerance = Math.abs(difference) <= input.tolerance;
  const status = withinTolerance
    ? input.warning
      ? ("warning" as const)
      : ("passed" as const)
    : ("failed" as const);
  return {
    code: input.code,
    version: CONTROL_RULE_VERSION,
    title: input.title,
    status,
    explanation: withinTolerance
      ? input.explanationPassed
      : input.explanationFailed,
    comparison: {
      sourceLabel: input.sourceLabel,
      sourceValue: round(input.sourceValue),
      comparisonLabel: input.comparisonLabel,
      comparisonValue: round(input.comparisonValue),
      difference,
      currency: input.currency,
    },
    tolerance: input.tolerance,
    period: input.period,
    basis: input.basis,
    coverage: {
      status: (input.coveragePercentage ?? 100) >= 100 ? "complete" : "partial",
      percentage: input.coveragePercentage ?? 100,
      explanation:
        (input.coveragePercentage ?? 100) >= 100
          ? "All required comparison data was available."
          : "The control used the available overlapping records.",
    },
    blockingGate: input.blockingGate,
    evidence: input.evidence,
  };
}

function reportPeriod(
  snapshot: AccountingSnapshot,
  generatedAt: string,
): AssessmentPeriod {
  const metadata = snapshot.reports.metadata?.trialBalance;
  return {
    startDate: metadata?.startDate,
    endDate:
      metadata?.endDate ??
      snapshot.pulledAt.slice(0, 10) ??
      generatedAt.slice(0, 10),
  };
}

function reportBasis(snapshot: AccountingSnapshot): AssessmentBasis {
  return snapshot.reports.metadata?.trialBalance?.basis ?? "unknown";
}

function openInvoiceTotal(snapshot: AccountingSnapshot): number {
  return sum(
    snapshot.invoices.map((invoice) => invoice.amountDue ?? invoice.total),
  );
}

function openBillTotal(snapshot: AccountingSnapshot): number {
  return sum(snapshot.bills.map((bill) => bill.amountDue ?? bill.total));
}

function recordCollections(
  snapshot: AccountingSnapshot,
): Array<Array<{ source?: { sourceId?: string } }>> {
  return [
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
}

function accountRows(rows: readonly ReportValue[]): Map<string, ReportValue> {
  return new Map(
    rows
      .filter((row): row is ReportValue & { accountId: string } =>
        Boolean(row.accountId),
      )
      .map((row) => [row.accountId, row]),
  );
}

function trialBalanceControl(
  snapshot: AccountingSnapshot,
  currency: string,
  period: AssessmentPeriod,
  basis: AssessmentBasis,
): FinancialControl {
  const rows = snapshot.reports.trialBalance;
  const evidence = [
    reportEvidence(
      "CONTROL_TRIAL_BALANCE",
      "QuickBooks Trial Balance",
      snapshot.pulledAt,
    ),
  ];
  if (!rows.length) {
    return unavailableControl({
      code: "CONTROL_TRIAL_BALANCE",
      title: "Trial Balance",
      explanation:
        "A trial balance was not available for the assessment period.",
      sourceLabel: "Total debits less credits",
      comparisonLabel: "Expected net balance",
      currency,
      period,
      basis,
      blockingGate: true,
      evidence,
    });
  }
  return comparedControl({
    code: "CONTROL_TRIAL_BALANCE",
    title: "Trial Balance",
    explanationPassed: "Total debits and credits agree within tolerance.",
    explanationFailed: "Total debits and credits do not agree.",
    sourceLabel: "Total debits less credits",
    sourceValue: sumReport(rows),
    comparisonLabel: "Expected net balance",
    comparisonValue: 0,
    tolerance: 1,
    currency,
    period,
    basis,
    blockingGate: true,
    evidence,
  });
}

function receivablesControl(
  snapshot: AccountingSnapshot,
  currency: string,
  period: AssessmentPeriod,
  basis: AssessmentBasis,
): FinancialControl {
  const open = openInvoiceTotal(snapshot);
  const rows = snapshot.reports.arAging;
  if (!open && !rows.length) {
    return notApplicableControl({
      code: "CONTROL_ACCOUNTS_RECEIVABLE",
      title: "Accounts Receivable",
      explanation: "No open receivables were present for this period.",
      currency,
      period,
      basis,
    });
  }
  if (!rows.length) {
    return unavailableControl({
      code: "CONTROL_ACCOUNTS_RECEIVABLE",
      title: "Accounts Receivable",
      explanation:
        "Open invoices exist, but an AR aging report was unavailable.",
      sourceLabel: "Open invoice balance",
      comparisonLabel: "AR aging balance",
      currency,
      period,
      basis,
      blockingGate: true,
    });
  }
  const aging = Math.abs(sumReport(rows));
  return comparedControl({
    code: "CONTROL_ACCOUNTS_RECEIVABLE",
    title: "Accounts Receivable",
    explanationPassed: "Open invoices agree with the AR aging report.",
    explanationFailed: "Open invoices do not agree with the AR aging report.",
    sourceLabel: "Open invoice balance",
    sourceValue: open,
    comparisonLabel: "AR aging balance",
    comparisonValue: aging,
    tolerance: Math.max(1, Math.abs(open) * 0.005),
    currency,
    period,
    basis,
    blockingGate: true,
    evidence: [
      reportEvidence(
        "CONTROL_ACCOUNTS_RECEIVABLE",
        "QuickBooks AR Aging",
        snapshot.pulledAt,
      ),
    ],
  });
}

function payablesControl(
  snapshot: AccountingSnapshot,
  currency: string,
  period: AssessmentPeriod,
  basis: AssessmentBasis,
): FinancialControl {
  const open = openBillTotal(snapshot);
  const rows = snapshot.reports.apAging;
  if (!open && !rows.length) {
    return notApplicableControl({
      code: "CONTROL_ACCOUNTS_PAYABLE",
      title: "Accounts Payable",
      explanation: "No open payables were present for this period.",
      currency,
      period,
      basis,
    });
  }
  if (!rows.length) {
    return unavailableControl({
      code: "CONTROL_ACCOUNTS_PAYABLE",
      title: "Accounts Payable",
      explanation: "Open bills exist, but an AP aging report was unavailable.",
      sourceLabel: "Open bill balance",
      comparisonLabel: "AP aging balance",
      currency,
      period,
      basis,
      blockingGate: true,
    });
  }
  const aging = Math.abs(sumReport(rows));
  return comparedControl({
    code: "CONTROL_ACCOUNTS_PAYABLE",
    title: "Accounts Payable",
    explanationPassed: "Open bills agree with the AP aging report.",
    explanationFailed: "Open bills do not agree with the AP aging report.",
    sourceLabel: "Open bill balance",
    sourceValue: open,
    comparisonLabel: "AP aging balance",
    comparisonValue: aging,
    tolerance: Math.max(1, Math.abs(open) * 0.005),
    currency,
    period,
    basis,
    blockingGate: true,
    evidence: [
      reportEvidence(
        "CONTROL_ACCOUNTS_PAYABLE",
        "QuickBooks AP Aging",
        snapshot.pulledAt,
      ),
    ],
  });
}

function bankControl(
  snapshot: AccountingSnapshot,
  currency: string,
  period: AssessmentPeriod,
  basis: AssessmentBasis,
): FinancialControl {
  const accounts = snapshot.accounts.filter(
    (account) => account.classification === "bank",
  );
  if (!accounts.length) {
    return notApplicableControl({
      code: "CONTROL_BANK_RECONCILIATION",
      title: "Bank Reconciliation",
      explanation:
        "No bank accounts were present in the extracted chart of accounts.",
      currency,
      period,
      basis,
    });
  }
  const rows = accountRows(snapshot.reports.trialBalance);
  const comparable = accounts.filter(
    (account) => account.currentBalance !== undefined && rows.has(account.id),
  );
  const sameDate = period.endDate === snapshot.pulledAt.slice(0, 10);
  if (!sameDate || comparable.length !== accounts.length) {
    return unavailableControl({
      code: "CONTROL_BANK_RECONCILIATION",
      title: "Bank Reconciliation",
      explanation:
        "Bank balances and trial-balance values were not available on the same date for every bank account.",
      sourceLabel: "Bank account balances",
      comparisonLabel: "Trial-balance bank balances",
      currency,
      period,
      basis,
      blockingGate: true,
    });
  }
  const current = sum(
    comparable.map((account) => account.currentBalance as MoneyAmount),
  );
  const trial = sum(comparable.map((account) => rows.get(account.id)!.amount));
  return comparedControl({
    code: "CONTROL_BANK_RECONCILIATION",
    title: "Bank Reconciliation",
    explanationPassed: "Bank account balances agree with the trial balance.",
    explanationFailed:
      "Bank account balances do not agree with the trial balance.",
    sourceLabel: "Bank account balances",
    sourceValue: current,
    comparisonLabel: "Trial-balance bank balances",
    comparisonValue: trial,
    tolerance: Math.max(1, Math.abs(current) * 0.005),
    currency,
    period,
    basis,
    blockingGate: true,
    evidence: [
      reportEvidence(
        "CONTROL_BANK_RECONCILIATION",
        "QuickBooks Trial Balance",
        snapshot.pulledAt,
      ),
    ],
  });
}

function matchingReportRows(
  snapshot: AccountingSnapshot,
  predicate: (label: string) => boolean,
): { trial?: ReportValue; balanceSheet?: ReportValue } {
  return {
    trial: snapshot.reports.trialBalance.find((row) => predicate(row.label)),
    balanceSheet: snapshot.reports.balanceSheet.find((row) =>
      predicate(row.label),
    ),
  };
}

function retainedEarningsControl(
  snapshot: AccountingSnapshot,
  currency: string,
  period: AssessmentPeriod,
  basis: AssessmentBasis,
): FinancialControl {
  const rows = matchingReportRows(snapshot, (label) =>
    /retained\s+earnings/i.test(label),
  );
  if (!rows.trial || !rows.balanceSheet) {
    return unavailableControl({
      code: "CONTROL_RETAINED_EARNINGS",
      title: "Retained Earnings",
      explanation:
        "Retained earnings was not available in both the trial balance and balance sheet.",
      sourceLabel: "Trial-balance retained earnings",
      comparisonLabel: "Balance-sheet retained earnings",
      currency,
      period,
      basis,
      blockingGate: true,
    });
  }
  return comparedControl({
    code: "CONTROL_RETAINED_EARNINGS",
    title: "Retained Earnings",
    explanationPassed: "Retained earnings agrees across the source reports.",
    explanationFailed: "Retained earnings differs between source reports.",
    sourceLabel: "Trial-balance retained earnings",
    sourceValue: rows.trial.amount.amount,
    comparisonLabel: "Balance-sheet retained earnings",
    comparisonValue: rows.balanceSheet.amount.amount,
    tolerance: 1,
    currency,
    period,
    basis,
    blockingGate: true,
    evidence: [
      reportEvidence(
        "CONTROL_RETAINED_EARNINGS",
        "QuickBooks Trial Balance and Balance Sheet",
        snapshot.pulledAt,
      ),
    ],
  });
}

function openingBalancesControl(
  snapshot: AccountingSnapshot,
  currency: string,
  period: AssessmentPeriod,
  basis: AssessmentBasis,
): FinancialControl {
  if (!snapshot.balances.length) {
    return unavailableControl({
      code: "CONTROL_OPENING_BALANCES",
      title: "Opening Balances",
      explanation:
        "No trial-balance-derived conversion balances were available.",
      sourceLabel: "Conversion balance net",
      comparisonLabel: "Expected net balance",
      currency,
      period,
      basis,
      blockingGate: true,
    });
  }
  return comparedControl({
    code: "CONTROL_OPENING_BALANCES",
    title: "Opening Balances",
    explanationPassed: "Conversion balances net to zero.",
    explanationFailed: "Conversion balances do not net to zero.",
    sourceLabel: "Conversion balance net",
    sourceValue: sum(snapshot.balances.map((balance) => balance.amount)),
    comparisonLabel: "Expected net balance",
    comparisonValue: 0,
    tolerance: 1,
    currency,
    period,
    basis,
    blockingGate: true,
    evidence: [
      controlEvidence(
        "CONTROL_OPENING_BALANCES",
        "Trial-balance-derived conversion balances",
        snapshot.pulledAt,
      ),
    ],
  });
}

function closingBalancesControl(
  snapshot: AccountingSnapshot,
  currency: string,
  period: AssessmentPeriod,
  basis: AssessmentBasis,
): FinancialControl {
  const trial = accountRows(snapshot.reports.trialBalance);
  const balanceSheet = accountRows(snapshot.reports.balanceSheet);
  const overlapping = [...trial.keys()].filter((id) => balanceSheet.has(id));
  if (!overlapping.length) {
    return unavailableControl({
      code: "CONTROL_CLOSING_BALANCES",
      title: "Closing Balances",
      explanation:
        "The trial balance and balance sheet did not contain comparable account-level rows.",
      sourceLabel: "Trial-balance account totals",
      comparisonLabel: "Balance-sheet account totals",
      currency,
      period,
      basis,
      blockingGate: true,
    });
  }
  const trialTotal = sum(overlapping.map((id) => trial.get(id)!.amount));
  const balanceTotal = sum(
    overlapping.map((id) => balanceSheet.get(id)!.amount),
  );
  const coverage = round(
    (overlapping.length / Math.max(1, balanceSheet.size)) * 100,
  );
  return comparedControl({
    code: "CONTROL_CLOSING_BALANCES",
    title: "Closing Balances",
    explanationPassed:
      "Comparable closing balances agree across source reports.",
    explanationFailed:
      "Comparable closing balances differ across source reports.",
    sourceLabel: "Trial-balance account totals",
    sourceValue: trialTotal,
    comparisonLabel: "Balance-sheet account totals",
    comparisonValue: balanceTotal,
    tolerance: Math.max(1, Math.abs(trialTotal) * 0.005),
    currency,
    period,
    basis,
    blockingGate: true,
    warning: coverage < 100,
    coveragePercentage: coverage,
    evidence: [
      reportEvidence(
        "CONTROL_CLOSING_BALANCES",
        "QuickBooks Trial Balance and Balance Sheet",
        snapshot.pulledAt,
      ),
    ],
  });
}

function taxLiabilityControl(
  snapshot: AccountingSnapshot,
  currency: string,
  period: AssessmentPeriod,
  basis: AssessmentBasis,
): FinancialControl {
  const taxAccounts = snapshot.accounts.filter((account) => {
    const subtype = String(account.sourceAccountSubType ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    return (
      subtype === "salestaxpayable" ||
      /sales tax payable|tax liability/i.test(account.name)
    );
  });
  if (!taxAccounts.length) {
    return notApplicableControl({
      code: "CONTROL_TAX_LIABILITY",
      title: "Tax Liability",
      explanation:
        "No tax-liability account was identified in the extracted chart.",
      currency,
      period,
      basis,
    });
  }
  const trial = accountRows(snapshot.reports.trialBalance);
  const balanceSheet = accountRows(snapshot.reports.balanceSheet);
  const comparable = taxAccounts.filter(
    (account) => trial.has(account.id) && balanceSheet.has(account.id),
  );
  if (comparable.length !== taxAccounts.length) {
    return unavailableControl({
      code: "CONTROL_TAX_LIABILITY",
      title: "Tax Liability",
      explanation:
        "Tax liabilities were not available in both the trial balance and balance sheet.",
      sourceLabel: "Trial-balance tax liabilities",
      comparisonLabel: "Balance-sheet tax liabilities",
      currency,
      period,
      basis,
      blockingGate: true,
    });
  }
  const trialTotal = sum(
    comparable.map((account) => trial.get(account.id)!.amount),
  );
  const balanceTotal = sum(
    comparable.map((account) => balanceSheet.get(account.id)!.amount),
  );
  return comparedControl({
    code: "CONTROL_TAX_LIABILITY",
    title: "Tax Liability",
    explanationPassed: "Tax liabilities agree across the source reports.",
    explanationFailed: "Tax liabilities differ across the source reports.",
    sourceLabel: "Trial-balance tax liabilities",
    sourceValue: trialTotal,
    comparisonLabel: "Balance-sheet tax liabilities",
    comparisonValue: balanceTotal,
    tolerance: Math.max(1, Math.abs(trialTotal) * 0.005),
    currency,
    period,
    basis,
    blockingGate: true,
    evidence: [
      reportEvidence(
        "CONTROL_TAX_LIABILITY",
        "QuickBooks Trial Balance and Balance Sheet",
        snapshot.pulledAt,
      ),
    ],
  });
}

function evidenceCoverageControl(
  snapshot: AccountingSnapshot,
  currency: string,
  period: AssessmentPeriod,
  basis: AssessmentBasis,
): FinancialControl {
  const records = recordCollections(snapshot).flat();
  const withLineage = records.filter((record) => record.source?.sourceId);
  const percentage = round(
    (withLineage.length / Math.max(1, records.length)) * 100,
  );
  const status =
    percentage >= 90 ? "passed" : percentage >= 70 ? "warning" : "failed";
  return {
    code: "CONTROL_EVIDENCE_COVERAGE",
    version: CONTROL_RULE_VERSION,
    title: "Evidence Coverage",
    status,
    explanation:
      status === "passed"
        ? "Source lineage is available for the assessed records."
        : "Some assessed records do not have complete source lineage.",
    comparison: {
      sourceLabel: "Records with source lineage",
      sourceValue: withLineage.length,
      comparisonLabel: "Assessed source records",
      comparisonValue: records.length,
      difference: records.length - withLineage.length,
      currency,
    },
    tolerance: 10,
    period,
    basis,
    coverage: {
      status: percentage >= 100 ? "complete" : "partial",
      percentage,
      explanation: "Coverage is based on stable source references.",
    },
    blockingGate: false,
    evidence: [
      controlEvidence(
        "CONTROL_EVIDENCE_COVERAGE",
        "Canonical source lineage",
        snapshot.pulledAt,
      ),
    ],
  };
}

function sourceFreshnessControl(
  snapshot: AccountingSnapshot,
  generatedAt: string,
  currency: string,
  period: AssessmentPeriod,
  basis: AssessmentBasis,
): FinancialControl {
  const pulledAt = Date.parse(snapshot.pulledAt);
  const assessedAt = Date.parse(generatedAt);
  if (!Number.isFinite(pulledAt) || !Number.isFinite(assessedAt)) {
    return unavailableControl({
      code: "CONTROL_SOURCE_FRESHNESS",
      title: "Source Freshness",
      explanation: "The extraction timestamp could not be validated.",
      sourceLabel: "Source age in hours",
      comparisonLabel: "Freshness target in hours",
      currency,
      period,
      basis,
      blockingGate: false,
    });
  }
  const ageHours = round(Math.max(0, assessedAt - pulledAt) / 3_600_000);
  const status =
    ageHours <= 24 ? "passed" : ageHours <= 72 ? "warning" : "failed";
  return {
    code: "CONTROL_SOURCE_FRESHNESS",
    version: CONTROL_RULE_VERSION,
    title: "Source Freshness",
    status,
    explanation:
      status === "passed"
        ? "The assessment uses a recent source extraction."
        : status === "warning"
          ? "The source extraction should be refreshed before final review."
          : "The source extraction is too old for a reliable current assessment.",
    comparison: {
      sourceLabel: "Source age in hours",
      sourceValue: ageHours,
      comparisonLabel: "Freshness target in hours",
      comparisonValue: 24,
      difference: round(ageHours - 24),
      currency,
    },
    tolerance: 24,
    period,
    basis,
    coverage: {
      status: "complete",
      percentage: 100,
      explanation: "A valid extraction timestamp was available.",
    },
    blockingGate: false,
    evidence: [
      controlEvidence(
        "CONTROL_SOURCE_FRESHNESS",
        "QuickBooks extraction timestamp",
        snapshot.pulledAt,
      ),
    ],
  };
}

export function buildFinancialControls(
  snapshot: AccountingSnapshot,
  generatedAt: string,
): FinancialControl[] {
  const currency = snapshot.organization.baseCurrency;
  const period = reportPeriod(snapshot, generatedAt);
  const basis = reportBasis(snapshot);
  return [
    trialBalanceControl(snapshot, currency, period, basis),
    receivablesControl(snapshot, currency, period, basis),
    payablesControl(snapshot, currency, period, basis),
    bankControl(snapshot, currency, period, basis),
    retainedEarningsControl(snapshot, currency, period, basis),
    openingBalancesControl(snapshot, currency, period, basis),
    closingBalancesControl(snapshot, currency, period, basis),
    taxLiabilityControl(snapshot, currency, period, basis),
    evidenceCoverageControl(snapshot, currency, period, basis),
    sourceFreshnessControl(snapshot, generatedAt, currency, period, basis),
  ];
}

export function assessmentPeriod(
  snapshot: AccountingSnapshot,
  generatedAt: string,
): AssessmentPeriod {
  return reportPeriod(snapshot, generatedAt);
}

export function assessmentBasis(snapshot: AccountingSnapshot): AssessmentBasis {
  return reportBasis(snapshot);
}
