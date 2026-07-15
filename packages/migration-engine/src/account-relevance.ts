import type {
  Account,
  AccountingSnapshot,
  TransactionLine,
} from "@preconfin/canonical-model";
import type {
  AccountMigrationScope,
  AccountRelevanceEvidence,
  AccountRelevanceReason,
} from "./types.js";

export const ACCOUNT_RELEVANCE_TOLERANCE = 0.01;

interface MutableAccountEvidence {
  periodDebitActivity: number;
  periodCreditActivity: number;
  periodTransactions: Set<string>;
  openDocumentReferenceCount: number;
  itemReferenceCount: number;
  taxDependencyCount: number;
  exportedRecordReferenceCount: number;
  unresolvedRelationshipCount: number;
}

interface AssessmentPeriod {
  startDate?: string;
  endDate?: string;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function normalized(value: string | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function selectedPeriod(snapshot: AccountingSnapshot): AssessmentPeriod {
  const metadata = snapshot.reports.metadata?.trialBalance;
  return {
    startDate: metadata?.startDate,
    endDate: metadata?.endDate,
  };
}

function isInPeriod(
  date: string | undefined,
  period: AssessmentPeriod,
): boolean {
  if (!date) return true;
  if (period.startDate && date < period.startDate) return false;
  if (period.endDate && date > period.endDate) return false;
  return true;
}

function systemRoles(account: Account): string[] {
  const type = normalized(account.sourceAccountType);
  const subtype = normalized(account.sourceAccountSubType);
  const name = normalized(account.name);
  const roles = new Set<string>();

  if (
    type === "accountsreceivable" ||
    account.classification === "accounts_receivable"
  ) {
    roles.add("accounts_receivable");
  }
  if (
    type === "accountspayable" ||
    account.classification === "accounts_payable"
  ) {
    roles.add("accounts_payable");
  }
  if (type === "fixedasset") roles.add("fixed_asset");
  if (subtype === "inventory") roles.add("inventory");
  if (subtype === "accumulateddepreciation") {
    roles.add("accumulated_depreciation");
  }
  if (subtype === "retainedearnings" || name.includes("retainedearnings")) {
    roles.add("retained_earnings");
  }
  if (
    subtype === "openingbalanceequity" ||
    name.includes("openingbalanceequity")
  ) {
    roles.add("opening_balance_equity");
  }
  if (subtype === "undepositedfunds" || name.includes("undepositedfunds")) {
    roles.add("undeposited_funds");
  }
  if (
    subtype === "salestaxpayable" ||
    name.includes("salestaxpayable") ||
    name.includes("taxliability")
  ) {
    roles.add("tax_liability");
  }
  return [...roles].sort();
}

function emptyMutableEvidence(): MutableAccountEvidence {
  return {
    periodDebitActivity: 0,
    periodCreditActivity: 0,
    periodTransactions: new Set(),
    openDocumentReferenceCount: 0,
    itemReferenceCount: 0,
    taxDependencyCount: 0,
    exportedRecordReferenceCount: 0,
    unresolvedRelationshipCount: 0,
  };
}

function recordActivity(
  states: Map<string, MutableAccountEvidence>,
  accountId: string | undefined,
  transactionId: string,
  amount: number,
  normalSide: "debit" | "credit",
  date: string | undefined,
  period: AssessmentPeriod,
  openDocument: boolean,
): void {
  if (!accountId) return;
  const state = states.get(accountId);
  if (!state) return;
  state.exportedRecordReferenceCount += 1;
  if (openDocument) state.openDocumentReferenceCount += 1;
  if (!isInPeriod(date, period)) return;

  const side =
    amount < 0 ? (normalSide === "debit" ? "credit" : "debit") : normalSide;
  if (side === "debit") state.periodDebitActivity += Math.abs(amount);
  else state.periodCreditActivity += Math.abs(amount);
  state.periodTransactions.add(transactionId);
}

function recordLines(
  states: Map<string, MutableAccountEvidence>,
  lines: readonly TransactionLine[],
  transactionId: string,
  normalSide: "debit" | "credit",
  date: string | undefined,
  period: AssessmentPeriod,
  openDocument: boolean,
): void {
  for (const line of lines) {
    recordActivity(
      states,
      line.accountId,
      transactionId,
      line.amount.amount,
      normalSide,
      date,
      period,
      openDocument,
    );
  }
}

function addOpenControlReferences(
  snapshot: AccountingSnapshot,
  states: Map<string, MutableAccountEvidence>,
): void {
  const openInvoices = snapshot.invoices.filter(
    (invoice) =>
      Math.abs(invoice.amountDue?.amount ?? 0) > ACCOUNT_RELEVANCE_TOLERANCE,
  ).length;
  const openBills = snapshot.bills.filter(
    (bill) =>
      Math.abs(bill.amountDue?.amount ?? 0) > ACCOUNT_RELEVANCE_TOLERANCE,
  ).length;
  for (const account of snapshot.accounts) {
    const state = states.get(account.id)!;
    if (account.classification === "accounts_receivable") {
      state.openDocumentReferenceCount += openInvoices;
    }
    if (account.classification === "accounts_payable") {
      state.openDocumentReferenceCount += openBills;
    }
  }
}

function collectActivity(
  snapshot: AccountingSnapshot,
): Map<string, MutableAccountEvidence> {
  const states = new Map(
    snapshot.accounts.map((account) => [account.id, emptyMutableEvidence()]),
  );
  const period = selectedPeriod(snapshot);

  for (const invoice of snapshot.invoices) {
    const open =
      Math.abs(invoice.amountDue?.amount ?? 0) > ACCOUNT_RELEVANCE_TOLERANCE;
    recordLines(
      states,
      invoice.lines,
      invoice.id,
      "credit",
      invoice.issueDate,
      period,
      open,
    );
  }
  for (const bill of snapshot.bills) {
    const open =
      Math.abs(bill.amountDue?.amount ?? 0) > ACCOUNT_RELEVANCE_TOLERANCE;
    recordLines(
      states,
      bill.lines,
      bill.id,
      "debit",
      bill.issueDate,
      period,
      open,
    );
  }
  for (const credit of snapshot.credits) {
    recordLines(
      states,
      credit.lines,
      credit.id,
      credit.type === "customer-credit" ? "debit" : "credit",
      credit.date,
      period,
      false,
    );
  }
  for (const journal of snapshot.journals) {
    for (const line of journal.lines) {
      recordActivity(
        states,
        line.accountId,
        journal.id,
        line.amount.amount,
        line.side,
        journal.date,
        period,
        false,
      );
    }
  }
  for (const payment of snapshot.payments) {
    recordActivity(
      states,
      payment.accountId,
      payment.id,
      payment.amount.amount,
      "debit",
      payment.date,
      period,
      payment.appliedTo.length > 0,
    );
  }

  for (const item of snapshot.items) {
    for (const accountId of new Set(
      [
        item.incomeAccountId,
        item.expenseAccountId,
        item.inventoryAssetAccountId,
      ].filter((value): value is string => Boolean(value)),
    )) {
      const state = states.get(accountId);
      if (state) state.itemReferenceCount += 1;
    }
  }

  const usedTaxReferences = [
    ...snapshot.invoices,
    ...snapshot.bills,
    ...snapshot.credits,
  ].flatMap((document) =>
    document.lines.filter((line) => line.taxCodeId || line.taxRateId),
  ).length;
  for (const account of snapshot.accounts) {
    if (systemRoles(account).includes("tax_liability")) {
      states.get(account.id)!.taxDependencyCount += usedTaxReferences;
    }
  }

  addOpenControlReferences(snapshot, states);
  return states;
}

function sumAccountBalances(
  snapshot: AccountingSnapshot,
  accountId: string,
  predicate: (basis: string) => boolean,
): number {
  return round(
    snapshot.balances
      .filter(
        (balance) =>
          balance.accountId === accountId && predicate(balance.basis),
      )
      .reduce((total, balance) => total + balance.amount.amount, 0),
  );
}

function closingBalance(
  snapshot: AccountingSnapshot,
  account: Account,
): number {
  const reportValue = snapshot.reports.trialBalance.find(
    (row) => row.accountId === account.id,
  )?.amount.amount;
  return round(reportValue ?? account.currentBalance?.amount ?? 0);
}

function relevanceReasons(
  evidence: AccountRelevanceEvidence,
): AccountRelevanceReason[] {
  const reasons: AccountRelevanceReason[] = [];
  const tolerance = evidence.tolerance;
  if (Math.abs(evidence.openingBalance) > tolerance) {
    reasons.push("non_zero_opening_balance");
  }
  if (Math.abs(evidence.conversionBalance) > tolerance) {
    reasons.push("non_zero_conversion_balance");
  }
  if (Math.abs(evidence.closingBalance) > tolerance) {
    reasons.push("non_zero_closing_balance");
  }
  if (
    Math.abs(evidence.periodDebitActivity) > tolerance ||
    Math.abs(evidence.periodCreditActivity) > tolerance ||
    evidence.transactionCount > 0
  ) {
    reasons.push("period_activity");
  }
  if (evidence.openDocumentReferenceCount > 0) {
    reasons.push("open_document_dependency");
  }
  if (evidence.itemReferenceCount > 0) reasons.push("item_dependency");
  if (evidence.taxDependencyCount > 0) reasons.push("tax_dependency");
  if (evidence.exportedRecordReferenceCount > 0) {
    reasons.push("exported_record_dependency");
  }
  if (evidence.systemRoles.length > 0) {
    reasons.push("required_system_account");
  }
  if (evidence.unresolvedRelationshipCount > 0) {
    reasons.push("unresolved_relationship");
  }
  return reasons;
}

export function assessAccountRelevance(
  snapshot: AccountingSnapshot,
): AccountMigrationScope[] {
  const activity = collectActivity(snapshot);
  return [...snapshot.accounts]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((account) => {
      const state = activity.get(account.id) ?? emptyMutableEvidence();
      const evidence: AccountRelevanceEvidence = {
        openingBalance: sumAccountBalances(
          snapshot,
          account.id,
          (basis) => basis === "opening-balance",
        ),
        conversionBalance: sumAccountBalances(
          snapshot,
          account.id,
          (basis) => basis === "trial-balance",
        ),
        closingBalance: closingBalance(snapshot, account),
        periodDebitActivity: round(state.periodDebitActivity),
        periodCreditActivity: round(state.periodCreditActivity),
        transactionCount: state.periodTransactions.size,
        openDocumentReferenceCount: state.openDocumentReferenceCount,
        itemReferenceCount: state.itemReferenceCount,
        taxDependencyCount: state.taxDependencyCount,
        exportedRecordReferenceCount: state.exportedRecordReferenceCount,
        unresolvedRelationshipCount: state.unresolvedRelationshipCount,
        systemRoles: systemRoles(account),
        active: account.active,
        tolerance: ACCOUNT_RELEVANCE_TOLERANCE,
      };
      const reasons = relevanceReasons(evidence);
      return {
        sourceId: account.id,
        disposition: reasons.length ? "auto_mapped" : "excluded_unused_account",
        relevanceReasons: reasons,
        evidence,
      };
    });
}
