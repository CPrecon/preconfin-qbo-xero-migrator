import type { AccountingSnapshot, Bill, Invoice, Journal, MoneyAmount } from "@preconfin/canonical-model";
import type { MigrationPlan } from "@preconfin/migration-engine";
import type { ValidationFinding, ValidationReport } from "./types.js";

function approxEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

function sum(values: MoneyAmount[]): number {
  return Number(values.reduce((total, value) => total + value.amount, 0).toFixed(2));
}

function finding(input: ValidationFinding): ValidationFinding {
  return input;
}

function duplicateFindings(entityType: string, entities: Array<{ id: string; name: string }>): ValidationFinding[] {
  const seen = new Map<string, Array<{ id: string; name: string }>>();
  for (const entity of entities) {
    const key = entity.name.trim().toLowerCase();
    if (!key) continue;
    seen.set(key, [...(seen.get(key) ?? []), entity]);
  }
  return [...seen.values()]
    .filter((items) => items.length > 1)
    .flatMap((items) =>
      items.map((item) =>
        finding({
          code: `DUPLICATE_${entityType.toUpperCase()}`,
          severity: "warning",
          title: `Duplicate ${entityType}`,
          message: `${item.name} appears more than once.`,
          recommendation: "Merge or rename duplicates before importing to Xero.",
          entityType,
          entityId: item.id
        })
      )
    );
}

function validateInvoiceTotals(invoices: Invoice[]): ValidationFinding[] {
  return invoices.flatMap((invoice) => {
    const computed = sum(invoice.lines.map((line) => line.amount)) + invoice.tax.amount;
    if (approxEqual(computed, invoice.total.amount)) return [];
    return [
      finding({
        code: "INVOICE_TOTAL_MISMATCH",
        severity: "error",
        title: "Invoice total mismatch",
        message: `${invoice.number} total does not match line totals plus tax.`,
        recommendation: "Review the invoice in QuickBooks before export.",
        entityType: "invoice",
        entityId: invoice.id
      })
    ];
  });
}

function validateBillTotals(bills: Bill[]): ValidationFinding[] {
  return bills.flatMap((bill) => {
    const computed = sum(bill.lines.map((line) => line.amount)) + bill.tax.amount;
    if (approxEqual(computed, bill.total.amount)) return [];
    return [
      finding({
        code: "BILL_TOTAL_MISMATCH",
        severity: "error",
        title: "Bill total mismatch",
        message: `${bill.number} total does not match line totals plus tax.`,
        recommendation: "Review the bill in QuickBooks before export.",
        entityType: "bill",
        entityId: bill.id
      })
    ];
  });
}

function validateJournals(journals: Journal[]): ValidationFinding[] {
  return journals.flatMap((journal) => {
    const debits = sum(journal.lines.filter((line) => line.side === "debit").map((line) => line.amount));
    const credits = sum(journal.lines.filter((line) => line.side === "credit").map((line) => line.amount));
    if (approxEqual(debits, credits)) return [];
    return [
      finding({
        code: "UNBALANCED_JOURNAL",
        severity: "error",
        title: "Unbalanced journal",
        message: `${journal.number ?? journal.id} has debits of ${debits} and credits of ${credits}.`,
        recommendation: "Correct or exclude unbalanced journal entries before migration.",
        entityType: "journal",
        entityId: journal.id
      })
    ];
  });
}

function validateDates(snapshot: AccountingSnapshot): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const invoice of snapshot.invoices) {
    if (invoice.issueDate && invoice.dueDate && invoice.dueDate < invoice.issueDate) {
      findings.push(finding({
        code: "INVOICE_DUE_BEFORE_ISSUE",
        severity: "warning",
        title: "Invoice date review",
        message: `${invoice.number} is due before its issue date.`,
        recommendation: "Review invoice dates before importing to Xero.",
        entityType: "invoice",
        entityId: invoice.id
      }));
    }
  }
  return findings;
}

function validateCurrencies(snapshot: AccountingSnapshot): ValidationFinding[] {
  const activeCurrencies = new Set(snapshot.currencies.filter((currency) => currency.active).map((currency) => currency.code));
  const usedCurrencies = new Set<string>();
  for (const invoice of snapshot.invoices) usedCurrencies.add(invoice.total.currency);
  for (const bill of snapshot.bills) usedCurrencies.add(bill.total.currency);
  for (const account of snapshot.accounts) if (account.currency) usedCurrencies.add(account.currency);
  return [...usedCurrencies]
    .filter((currency) => !activeCurrencies.has(currency))
    .map((currency) =>
      finding({
        code: "INVALID_CURRENCY",
        severity: "error",
        title: "Currency not configured",
        message: `${currency} is used by migrated data but is not an active currency in the canonical model.`,
        recommendation: "Enable the currency in Xero or convert transactions before migration."
      })
    );
}

function validateScale(snapshot: AccountingSnapshot): ValidationFinding[] {
  const transactionCount = snapshot.invoices.length + snapshot.bills.length + snapshot.payments.length + snapshot.credits.length + snapshot.journals.length;
  if (transactionCount < 10000) return [];
  return [finding({
    code: "LARGE_TRANSACTION_COUNT",
    severity: "warning",
    title: "Large migration volume",
    message: `${transactionCount.toLocaleString()} transactions were detected.`,
    recommendation: "Run an assisted migration plan and split import files by period to reduce Xero import risk."
  })];
}

function validateTrialBalance(snapshot: AccountingSnapshot): ValidationFinding[] {
  if (!snapshot.reports.trialBalance.length) {
    return [finding({
      code: "MISSING_TRIAL_BALANCE",
      severity: "warning",
      title: "Trial balance unavailable",
      message: "QuickBooks did not return a trial balance report for this scan.",
      recommendation: "Reconnect QuickBooks and rerun the scan, or export a trial balance manually for reconciliation."
    })];
  }
  const total = sum(snapshot.reports.trialBalance.map((row) => row.amount));
  if (approxEqual(total, 0, 1)) return [];
  return [finding({
    code: "TRIAL_BALANCE_NOT_ZERO",
    severity: "error",
    title: "Trial balance does not net to zero",
    message: `Trial balance net total is ${total}.`,
    recommendation: "Review report basis, date range, and retained earnings before migration."
  })];
}

function migrationPlanFindings(plan: MigrationPlan): ValidationFinding[] {
  return plan.exceptions.map((exception) => finding({
    code: exception.code,
    severity: exception.severity,
    title: exception.code.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()),
    message: exception.message,
    recommendation: exception.recommendation,
    entityType: exception.entityType,
    entityId: exception.entityId
  }));
}

export function validateMigration(snapshot: AccountingSnapshot, plan: MigrationPlan): ValidationReport {
  const findings = [
    ...validateTrialBalance(snapshot),
    ...duplicateFindings("contact", snapshot.contacts.map((contact) => ({ id: contact.id, name: contact.name }))),
    ...duplicateFindings("account", snapshot.accounts.map((account) => ({ id: account.id, name: account.name }))),
    ...validateInvoiceTotals(snapshot.invoices),
    ...validateBillTotals(snapshot.bills),
    ...validateJournals(snapshot.journals),
    ...validateCurrencies(snapshot),
    ...validateDates(snapshot),
    ...validateScale(snapshot),
    ...snapshot.items.filter((item) => item.isInventory).map((item) => finding({
      code: "UNSUPPORTED_INVENTORY",
      severity: "warning" as const,
      title: "Inventory requires review",
      message: `${item.name} is an inventory item.`,
      recommendation: "Xero CSV migration requires inventory setup review before import.",
      entityType: "item",
      entityId: item.id
    })),
    ...migrationPlanFindings(plan)
  ];

  const errorCount = findings.filter((item) => item.severity === "error").length;
  const warningCount = findings.filter((item) => item.severity === "warning").length;
  const infoCount = findings.filter((item) => item.severity === "info").length;
  const score = Math.max(0, Math.min(100, 100 - errorCount * 12 - warningCount * 4 - infoCount));
  const readiness = errorCount > 0 ? "blocked" : warningCount > 0 ? "review_needed" : "ready";

  const recommendations = [
    readiness === "ready" ? "The data is ready for a controlled Xero CSV migration." : "Resolve errors before importing into Xero.",
    warningCount > 0 ? "Review warnings with an accountant or PreconFin migration specialist." : "Keep a copy of the generated package for audit evidence.",
    "Import into a Xero demo organization first, then reconcile AR, AP, bank, and retained earnings before go-live."
  ];

  return {
    summary: {
      score,
      readiness,
      errorCount,
      warningCount,
      infoCount,
      generatedAt: new Date().toISOString()
    },
    findings,
    recommendations
  };
}

export type { ValidationFinding, ValidationReport, ValidationSeverity, ValidationSummary } from "./types.js";
