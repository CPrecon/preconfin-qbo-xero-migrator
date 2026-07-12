import type {
  Account,
  AccountingSnapshot,
  Bill,
  Contact,
  Credit,
  Invoice,
  Item,
  Journal,
  MoneyAmount,
  Payment,
  TransactionLine,
} from "@preconfin/canonical-model";
import type { MappingResult, MigrationPlan } from "@preconfin/migration-engine";
import type {
  AffectedSourceRecord,
  ValidationFinding,
  ValidationReport,
} from "./types.js";

function approxEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

function sum(values: MoneyAmount[]): number {
  return Number(
    values.reduce((total, value) => total + value.amount, 0).toFixed(2),
  );
}

function sumAbs(values: MoneyAmount[]): number {
  return Number(
    values
      .reduce((total, value) => total + Math.abs(value.amount), 0)
      .toFixed(2),
  );
}

function sourceRecord(
  entity: {
    id: string;
    source?: { sourceId?: string; sourceType?: string };
    name?: string;
    number?: string;
  },
  label?: string,
): AffectedSourceRecord {
  return {
    sourceId: entity.source?.sourceId ?? entity.id,
    sourceType: entity.source?.sourceType ?? "unknown",
    label: label ?? entity.name ?? entity.number ?? entity.id,
  };
}

function finding(
  input: Omit<ValidationFinding, "affectedRecords" | "blocksExport"> &
    Partial<Pick<ValidationFinding, "affectedRecords" | "blocksExport">>,
): ValidationFinding {
  return {
    ...input,
    affectedRecords: input.affectedRecords ?? [],
    blocksExport: input.blocksExport ?? input.severity === "error",
  };
}

function duplicateFindings(
  entityType: string,
  entities: Array<{
    id: string;
    name: string;
    source?: { sourceId?: string; sourceType?: string };
  }>,
): ValidationFinding[] {
  const seen = new Map<
    string,
    Array<{
      id: string;
      name: string;
      source?: { sourceId?: string; sourceType?: string };
    }>
  >();
  for (const entity of entities) {
    const key = entity.name.trim().toLowerCase();
    if (!key) continue;
    seen.set(key, [...(seen.get(key) ?? []), entity]);
  }
  return [...seen.values()]
    .filter((items) => items.length > 1)
    .map((items) =>
      finding({
        code: `DUPLICATE_${entityType.toUpperCase()}`,
        severity: "warning",
        title: `Duplicate ${entityType}`,
        message: `${items[0]!.name} appears more than once.`,
        recommendation: "Merge or rename duplicates before importing to Xero.",
        entityType,
        affectedRecords: items.map((item) => sourceRecord(item, item.name)),
        blocksExport: false,
      }),
    );
}

function duplicateDocumentFindings(
  entityType: string,
  documents: Array<{
    id: string;
    number?: string;
    source?: { sourceId?: string; sourceType?: string };
  }>,
): ValidationFinding[] {
  const seen = new Map<
    string,
    Array<{
      id: string;
      number?: string;
      source?: { sourceId?: string; sourceType?: string };
    }>
  >();
  for (const document of documents) {
    const key = String(document.number ?? "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    seen.set(key, [...(seen.get(key) ?? []), document]);
  }
  return [...seen.values()]
    .filter((items) => items.length > 1)
    .map((items) =>
      finding({
        code: `DUPLICATE_${entityType.toUpperCase()}_NUMBER`,
        severity: "warning",
        title: `Duplicate ${entityType} number`,
        message: `${items[0]!.number} appears on more than one ${entityType}.`,
        recommendation:
          "Resolve duplicate document numbers before importing to Xero to avoid import conflicts.",
        entityType,
        affectedRecords: items.map((item) => sourceRecord(item, item.number)),
        blocksExport: false,
      }),
    );
}

function validateInvoiceTotals(invoices: Invoice[]): ValidationFinding[] {
  return invoices.flatMap((invoice) => {
    const computed =
      sum(invoice.lines.map((line) => line.amount)) + invoice.tax.amount;
    if (approxEqual(computed, invoice.total.amount)) return [];
    return [
      finding({
        code: "INVOICE_TOTAL_MISMATCH",
        severity: "error",
        title: "Invoice total mismatch",
        message: `${invoice.number} total does not match line totals plus tax.`,
        recommendation: "Review the invoice in QuickBooks before export.",
        entityType: "invoice",
        entityId: invoice.id,
        affectedRecords: [sourceRecord(invoice, invoice.number)],
      }),
    ];
  });
}

function validateBillTotals(bills: Bill[]): ValidationFinding[] {
  return bills.flatMap((bill) => {
    const computed =
      sum(bill.lines.map((line) => line.amount)) + bill.tax.amount;
    if (approxEqual(computed, bill.total.amount)) return [];
    return [
      finding({
        code: "BILL_TOTAL_MISMATCH",
        severity: "error",
        title: "Bill total mismatch",
        message: `${bill.number} total does not match line totals plus tax.`,
        recommendation: "Review the bill in QuickBooks before export.",
        entityType: "bill",
        entityId: bill.id,
        affectedRecords: [sourceRecord(bill, bill.number)],
      }),
    ];
  });
}

function validateCreditTotals(credits: Credit[]): ValidationFinding[] {
  return credits.flatMap((credit) => {
    const computed = sum(credit.lines.map((line) => line.amount));
    if (approxEqual(computed, credit.total.amount)) return [];
    return [
      finding({
        code: "CREDIT_TOTAL_MISMATCH",
        severity: "error",
        title: "Credit total mismatch",
        message: `${credit.number ?? credit.id} total does not match line totals.`,
        recommendation:
          "Review the credit memo or vendor credit before export.",
        entityType: "credit",
        entityId: credit.id,
        affectedRecords: [sourceRecord(credit, credit.number)],
      }),
    ];
  });
}

function validateJournals(journals: Journal[]): ValidationFinding[] {
  return journals.flatMap((journal) => {
    const debits = sum(
      journal.lines
        .filter((line) => line.side === "debit")
        .map((line) => line.amount),
    );
    const credits = sum(
      journal.lines
        .filter((line) => line.side === "credit")
        .map((line) => line.amount),
    );
    if (approxEqual(debits, credits)) return [];
    return [
      finding({
        code: "UNBALANCED_JOURNAL",
        severity: "error",
        title: "Unbalanced journal",
        message: `${journal.number ?? journal.id} has debits of ${debits} and credits of ${credits}.`,
        recommendation:
          "Correct or exclude unbalanced journal entries before migration.",
        entityType: "journal",
        entityId: journal.id,
        affectedRecords: [sourceRecord(journal, journal.number)],
      }),
    ];
  });
}

function validateDates(snapshot: AccountingSnapshot): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const invoice of snapshot.invoices) {
    if (invoice.issueDate && Number.isNaN(Date.parse(invoice.issueDate))) {
      findings.push(
        finding({
          code: "INVALID_INVOICE_DATE",
          severity: "error",
          title: "Invalid invoice date",
          message: `${invoice.number} has an invalid issue date.`,
          recommendation:
            "Correct the invoice date in QuickBooks before export.",
          entityType: "invoice",
          entityId: invoice.id,
          affectedRecords: [sourceRecord(invoice, invoice.number)],
        }),
      );
    }
    if (
      invoice.issueDate &&
      invoice.dueDate &&
      invoice.dueDate < invoice.issueDate
    ) {
      findings.push(
        finding({
          code: "INVOICE_DUE_BEFORE_ISSUE",
          severity: "warning",
          title: "Invoice date review",
          message: `${invoice.number} is due before its issue date.`,
          recommendation: "Review invoice dates before importing to Xero.",
          entityType: "invoice",
          entityId: invoice.id,
          affectedRecords: [sourceRecord(invoice, invoice.number)],
          blocksExport: false,
        }),
      );
    }
  }
  for (const bill of snapshot.bills) {
    if (bill.issueDate && Number.isNaN(Date.parse(bill.issueDate))) {
      findings.push(
        finding({
          code: "INVALID_BILL_DATE",
          severity: "error",
          title: "Invalid bill date",
          message: `${bill.number} has an invalid bill date.`,
          recommendation: "Correct the bill date in QuickBooks before export.",
          entityType: "bill",
          entityId: bill.id,
          affectedRecords: [sourceRecord(bill, bill.number)],
        }),
      );
    }
  }
  return findings;
}

function validateCurrencies(snapshot: AccountingSnapshot): ValidationFinding[] {
  const activeCurrencies = new Set(
    snapshot.currencies
      .filter((currency) => currency.active)
      .map((currency) => currency.code),
  );
  const usedCurrencies = new Set<string>();
  for (const invoice of snapshot.invoices)
    usedCurrencies.add(invoice.total.currency);
  for (const bill of snapshot.bills) usedCurrencies.add(bill.total.currency);
  for (const credit of snapshot.credits)
    usedCurrencies.add(credit.total.currency);
  for (const account of snapshot.accounts)
    if (account.currency) usedCurrencies.add(account.currency);
  return [...usedCurrencies]
    .filter((currency) => !activeCurrencies.has(currency))
    .map((currency) =>
      finding({
        code: "INVALID_CURRENCY",
        severity: "error",
        title: "Currency not configured",
        message: `${currency} is used by migrated data but is not an active currency in the canonical model.`,
        recommendation:
          "Enable the currency in Xero or convert transactions before migration.",
        affectedRecords: [],
      }),
    );
}

function validateScale(snapshot: AccountingSnapshot): ValidationFinding[] {
  const transactionCount =
    snapshot.invoices.length +
    snapshot.bills.length +
    snapshot.payments.length +
    snapshot.credits.length +
    snapshot.journals.length;
  if (transactionCount < 10000) return [];
  return [
    finding({
      code: "LARGE_TRANSACTION_COUNT",
      severity: "warning",
      title: "Large migration volume",
      message: `${transactionCount.toLocaleString()} transactions were detected.`,
      recommendation:
        "Run an assisted migration plan and split import files by period to reduce Xero import risk.",
      affectedRecords: [],
      blocksExport: false,
    }),
  ];
}

function validateTrialBalance(
  snapshot: AccountingSnapshot,
): ValidationFinding[] {
  if (!snapshot.reports.trialBalance.length) {
    return [
      finding({
        code: "MISSING_TRIAL_BALANCE",
        severity: "warning",
        title: "Trial balance unavailable",
        message:
          "QuickBooks did not return a trial balance report for this scan.",
        recommendation:
          "Reconnect QuickBooks and rerun the scan, or export a trial balance manually for reconciliation.",
        affectedRecords: [],
        blocksExport: false,
      }),
    ];
  }
  const total = sum(snapshot.reports.trialBalance.map((row) => row.amount));
  if (approxEqual(total, 0, 1)) return [];
  return [
    finding({
      code: "TRIAL_BALANCE_NOT_ZERO",
      severity: "error",
      title: "Trial balance does not net to zero",
      message: `Trial balance net total is ${total}.`,
      recommendation:
        "Review report basis, date range, and retained earnings before migration.",
      affectedRecords: [],
    }),
  ];
}

function validateArApAgreement(
  snapshot: AccountingSnapshot,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const arOpen = sumAbs(
    snapshot.invoices.map((invoice) => invoice.amountDue ?? invoice.total),
  );
  const apOpen = sumAbs(
    snapshot.bills.map((bill) => bill.amountDue ?? bill.total),
  );
  if (snapshot.reports.arAging.length) {
    const arAging = sumAbs(snapshot.reports.arAging.map((row) => row.amount));
    if (!approxEqual(arOpen, arAging, Math.max(1, arOpen * 0.005)))
      findings.push(
        finding({
          code: "AR_AGING_MISMATCH",
          severity: "error",
          title: "Receivables do not agree",
          message: `Open invoices total ${arOpen.toFixed(2)}, but AR aging totals ${arAging.toFixed(2)}.`,
          recommendation: "Reconcile receivables in QuickBooks before import.",
          affectedRecords: [],
        }),
      );
  } else if (
    snapshot.invoices.some((invoice) => (invoice.amountDue?.amount ?? 0) > 0)
  ) {
    findings.push(
      finding({
        code: "AR_AGING_UNAVAILABLE",
        severity: "info",
        title: "AR aging unavailable",
        message:
          "Open invoices exist, but QuickBooks did not return AR aging data for comparison.",
        recommendation:
          "Export AR aging from QuickBooks manually and reconcile before import.",
        affectedRecords: [],
        blocksExport: false,
      }),
    );
  }
  if (snapshot.reports.apAging.length) {
    const apAging = sumAbs(snapshot.reports.apAging.map((row) => row.amount));
    if (!approxEqual(apOpen, apAging, Math.max(1, apOpen * 0.005)))
      findings.push(
        finding({
          code: "AP_AGING_MISMATCH",
          severity: "error",
          title: "Payables do not agree",
          message: `Open bills total ${apOpen.toFixed(2)}, but AP aging totals ${apAging.toFixed(2)}.`,
          recommendation: "Reconcile payables in QuickBooks before import.",
          affectedRecords: [],
        }),
      );
  } else if (snapshot.bills.some((bill) => (bill.amountDue?.amount ?? 0) > 0)) {
    findings.push(
      finding({
        code: "AP_AGING_UNAVAILABLE",
        severity: "info",
        title: "AP aging unavailable",
        message:
          "Open bills exist, but QuickBooks did not return AP aging data for comparison.",
        recommendation:
          "Export AP aging from QuickBooks manually and reconcile before import.",
        affectedRecords: [],
        blocksExport: false,
      }),
    );
  }
  return findings;
}

function validateReferences(snapshot: AccountingSnapshot): ValidationFinding[] {
  const contacts = new Set(snapshot.contacts.map((contact) => contact.id));
  const accounts = new Set(snapshot.accounts.map((account) => account.id));
  const items = new Set(snapshot.items.map((item) => item.id));
  const taxRates = new Set(snapshot.taxRates.map((tax) => tax.id));
  const findings: ValidationFinding[] = [];

  const lineChecks = (
    owner: Invoice | Bill | Credit | Journal,
    entityType: string,
    lines: TransactionLine[],
  ) => {
    for (const line of lines) {
      if (!line.accountId) {
        findings.push(
          finding({
            code: "MISSING_ACCOUNT_REFERENCE",
            severity: "error",
            title: "Missing account reference",
            message: `${entityType} ${owner.number ?? owner.id} has a line without an account.`,
            recommendation:
              "Assign an account to every transaction line before export.",
            entityType,
            entityId: owner.id,
            affectedRecords: [sourceRecord(owner, owner.number)],
          }),
        );
      } else if (!accounts.has(line.accountId)) {
        findings.push(
          finding({
            code: "INVALID_ACCOUNT_REFERENCE",
            severity: "error",
            title: "Invalid account reference",
            message: `${entityType} ${owner.number ?? owner.id} references an account that was not extracted.`,
            recommendation:
              "Reconnect QuickBooks and rerun the scan, or repair the transaction account reference.",
            entityType,
            entityId: owner.id,
            affectedRecords: [sourceRecord(owner, owner.number)],
          }),
        );
      }
      if (line.itemId && !items.has(line.itemId))
        findings.push(
          finding({
            code: "INVALID_ITEM_REFERENCE",
            severity: "error",
            title: "Invalid item reference",
            message: `${entityType} ${owner.number ?? owner.id} references an item that was not extracted.`,
            recommendation:
              "Repair the item reference or exclude the transaction before import.",
            entityType,
            entityId: owner.id,
            affectedRecords: [sourceRecord(owner, owner.number)],
          }),
        );
      if (line.taxRateId && !taxRates.has(line.taxRateId))
        findings.push(
          finding({
            code: "INVALID_TAX_REFERENCE",
            severity: "warning",
            title: "Tax mapping review",
            message: `${entityType} ${owner.number ?? owner.id} references a tax code that did not normalize to an active tax rate.`,
            recommendation:
              "Map the tax code manually before importing to Xero.",
            entityType,
            entityId: owner.id,
            affectedRecords: [sourceRecord(owner, owner.number)],
            blocksExport: false,
          }),
        );
    }
  };

  for (const invoice of snapshot.invoices) {
    if (!invoice.contactId || !contacts.has(invoice.contactId))
      findings.push(
        finding({
          code: "MISSING_CUSTOMER_REFERENCE",
          severity: "error",
          title: "Missing customer",
          message: `${invoice.number} does not reference an extracted customer.`,
          recommendation: "Repair the customer reference before export.",
          entityType: "invoice",
          entityId: invoice.id,
          affectedRecords: [sourceRecord(invoice, invoice.number)],
        }),
      );
    lineChecks(invoice, "invoice", invoice.lines);
  }
  for (const bill of snapshot.bills) {
    if (!bill.contactId || !contacts.has(bill.contactId))
      findings.push(
        finding({
          code: "MISSING_SUPPLIER_REFERENCE",
          severity: "error",
          title: "Missing supplier",
          message: `${bill.number} does not reference an extracted supplier.`,
          recommendation: "Repair the supplier reference before export.",
          entityType: "bill",
          entityId: bill.id,
          affectedRecords: [sourceRecord(bill, bill.number)],
        }),
      );
    lineChecks(bill, "bill", bill.lines);
  }
  for (const credit of snapshot.credits) {
    if (!credit.contactId || !contacts.has(credit.contactId))
      findings.push(
        finding({
          code: "MISSING_CREDIT_CONTACT_REFERENCE",
          severity: "warning",
          title: "Credit contact review",
          message: `${credit.number ?? credit.id} does not reference an extracted contact.`,
          recommendation: "Review the credit contact before import.",
          entityType: "credit",
          entityId: credit.id,
          affectedRecords: [sourceRecord(credit, credit.number)],
          blocksExport: false,
        }),
      );
    lineChecks(credit, "credit", credit.lines);
  }
  for (const journal of snapshot.journals)
    lineChecks(journal, "journal", journal.lines);
  return findings;
}

function validatePaymentAllocations(
  snapshot: AccountingSnapshot,
): ValidationFinding[] {
  const transactions = new Set(
    [
      ...snapshot.invoices,
      ...snapshot.bills,
      ...snapshot.credits,
      ...snapshot.journals,
    ].map((item) => item.id),
  );
  const findings: ValidationFinding[] = [];
  for (const payment of snapshot.payments) {
    const applied = sum(
      payment.appliedTo.map((allocation) => allocation.amount),
    );
    if (applied > payment.amount.amount + 0.01) {
      findings.push(
        finding({
          code: "PAYMENT_ALLOCATION_EXCEEDS_TOTAL",
          severity: "error",
          title: "Payment allocation mismatch",
          message: `${payment.number ?? payment.id} applies more than the payment total.`,
          recommendation:
            "Review payment allocations in QuickBooks before export.",
          entityType: "payment",
          entityId: payment.id,
          affectedRecords: [sourceRecord(payment, payment.number)],
        }),
      );
    }
    for (const allocation of payment.appliedTo) {
      if (!transactions.has(allocation.transactionId))
        findings.push(
          finding({
            code: "PAYMENT_LINKED_TRANSACTION_MISSING",
            severity: "warning",
            title: "Payment link review",
            message: `${payment.number ?? payment.id} links to a transaction that was not extracted.`,
            recommendation: "Review linked payment allocations before import.",
            entityType: "payment",
            entityId: payment.id,
            affectedRecords: [sourceRecord(payment, payment.number)],
            blocksExport: false,
          }),
        );
    }
  }
  return findings;
}

function validateMappings(
  snapshot: AccountingSnapshot,
  plan: MigrationPlan,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const accountById = new Map(
    snapshot.accounts.map((account) => [account.id, account]),
  );
  const codeGroups = new Map<string, MappingResult[]>();
  for (const mapping of plan.accountMappings) {
    if (!mapping.targetCode) {
      findings.push(
        finding({
          code: "MISSING_ACCOUNT_CODE_MAPPING",
          severity: "error",
          title: "Missing account code",
          message: `${mapping.sourceName} does not have a Xero account code.`,
          recommendation: "Assign a valid Xero account code before import.",
          entityType: "account",
          entityId: mapping.sourceId,
          affectedRecords: accountById.has(mapping.sourceId)
            ? [
                sourceRecord(
                  accountById.get(mapping.sourceId) as Account,
                  mapping.sourceName,
                ),
              ]
            : [],
        }),
      );
      continue;
    }
    if (!/^[A-Za-z0-9._-]{1,10}$/.test(mapping.targetCode))
      findings.push(
        finding({
          code: "INVALID_XERO_ACCOUNT_CODE",
          severity: "error",
          title: "Invalid Xero account code",
          message: `${mapping.targetCode} is not a safe Xero account code.`,
          recommendation:
            "Use a unique alphanumeric account code of 10 characters or fewer.",
          entityType: "account",
          entityId: mapping.sourceId,
          affectedRecords: accountById.has(mapping.sourceId)
            ? [
                sourceRecord(
                  accountById.get(mapping.sourceId) as Account,
                  mapping.sourceName,
                ),
              ]
            : [],
        }),
      );
    const key = mapping.targetCode.toLowerCase();
    codeGroups.set(key, [...(codeGroups.get(key) ?? []), mapping]);
  }
  for (const group of codeGroups.values()) {
    if (group.length > 1)
      findings.push(
        finding({
          code: "DUPLICATE_XERO_ACCOUNT_CODE",
          severity: "error",
          title: "Duplicate Xero account code",
          message: `${group[0]!.targetCode} is assigned to more than one account.`,
          recommendation:
            "Assign unique account codes before importing to Xero.",
          entityType: "account",
          affectedRecords: group.flatMap((mapping) =>
            accountById.has(mapping.sourceId)
              ? [
                  sourceRecord(
                    accountById.get(mapping.sourceId) as Account,
                    mapping.sourceName,
                  ),
                ]
              : [],
          ),
        }),
      );
  }
  const mappedTaxes = new Set(
    plan.taxMappings.map((mapping) => mapping.sourceId),
  );
  const usedTaxes = new Set<string>();
  for (const doc of [
    ...snapshot.invoices,
    ...snapshot.bills,
    ...snapshot.credits,
  ])
    for (const line of doc.lines)
      if (line.taxRateId) usedTaxes.add(line.taxRateId);
  for (const taxId of usedTaxes)
    if (!mappedTaxes.has(taxId))
      findings.push(
        finding({
          code: "MISSING_TAX_MAPPING",
          severity: "warning",
          title: "Missing tax mapping",
          message: `${taxId} is used by transactions but has no generated Xero tax mapping.`,
          recommendation:
            "Map this tax code manually before importing affected files.",
          affectedRecords: [],
          blocksExport: false,
        }),
      );
  return findings;
}

function validateTracking(snapshot: AccountingSnapshot): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const byCategory = new Map<string, TrackingCategoryGroup>();
  for (const tracking of snapshot.tracking) {
    const group = byCategory.get(tracking.name) ?? {
      name: tracking.name,
      options: [],
    };
    group.options.push(tracking.option);
    byCategory.set(tracking.name, group);
  }
  if (byCategory.size > 2)
    findings.push(
      finding({
        code: "XERO_TRACKING_CATEGORY_LIMIT",
        severity: "error",
        title: "Too many tracking categories",
        message: `Xero supports up to two active tracking categories; ${byCategory.size} were detected.`,
        recommendation:
          "Consolidate QuickBooks classes and locations before import.",
        affectedRecords: [],
      }),
    );
  for (const group of byCategory.values())
    if (group.options.length > 100)
      findings.push(
        finding({
          code: "XERO_TRACKING_OPTION_LIMIT",
          severity: "warning",
          title: "Many tracking options",
          message: `${group.name} has ${group.options.length} options.`,
          recommendation:
            "Review Xero tracking option limits and archive unused classes or locations.",
          affectedRecords: [],
          blocksExport: false,
        }),
      );
  const docs = [
    ...snapshot.invoices,
    ...snapshot.bills,
    ...snapshot.credits,
    ...snapshot.journals,
  ];
  for (const doc of docs)
    for (const line of doc.lines)
      if (
        line.tracking &&
        Object.keys(line.tracking).filter((key) => line.tracking?.[key])
          .length > 2
      )
        findings.push(
          finding({
            code: "LINE_TRACKING_LIMIT",
            severity: "error",
            title: "Line tracking exceeds Xero limit",
            message: `${doc.number ?? doc.id} has a line with more than two tracking dimensions.`,
            recommendation: "Reduce tracking dimensions before export.",
            entityId: doc.id,
            affectedRecords: [sourceRecord(doc, doc.number)],
          }),
        );
  return findings;
}

interface TrackingCategoryGroup {
  name: string;
  options: string[];
}

function validateInactiveEntities(
  snapshot: AccountingSnapshot,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const usedAccounts = new Set<string>();
  const usedContacts = new Set<string>();
  const usedItems = new Set<string>();
  for (const doc of [
    ...snapshot.invoices,
    ...snapshot.bills,
    ...snapshot.credits,
    ...snapshot.journals,
  ]) {
    if ("contactId" in doc && doc.contactId) usedContacts.add(doc.contactId);
    for (const line of doc.lines) {
      if (line.accountId) usedAccounts.add(line.accountId);
      if (line.itemId) usedItems.add(line.itemId);
    }
  }
  for (const account of snapshot.accounts.filter(
    (account) => !account.active && usedAccounts.has(account.id),
  ))
    findings.push(inactiveFinding("account", account));
  for (const contact of snapshot.contacts.filter(
    (contact) => !contact.active && usedContacts.has(contact.id),
  ))
    findings.push(inactiveFinding("contact", contact));
  for (const item of snapshot.items.filter(
    (item) => !item.active && usedItems.has(item.id),
  ))
    findings.push(inactiveFinding("item", item));
  return findings;
}

function inactiveFinding(
  entityType: string,
  entity: Account | Contact | Item,
): ValidationFinding {
  return finding({
    code: `INACTIVE_${entityType.toUpperCase()}_USED`,
    severity: "warning",
    title: `Inactive ${entityType} used`,
    message: `${entity.name} is inactive but appears in migration data.`,
    recommendation: "Reactivate, map, or exclude this record before import.",
    entityType,
    entityId: entity.id,
    affectedRecords: [sourceRecord(entity, entity.name)],
    blocksExport: false,
  });
}

function validateOpeningBalances(
  snapshot: AccountingSnapshot,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (!snapshot.balances.length)
    findings.push(
      finding({
        code: "OPENING_BALANCES_UNAVAILABLE",
        severity: "warning",
        title: "Opening balances need review",
        message: "No trial-balance-derived opening balances were generated.",
        recommendation:
          "Generate an opening balance file from a reconciled trial balance before import.",
        affectedRecords: [],
        blocksExport: false,
      }),
    );
  if (
    !snapshot.accounts.some(
      (account) =>
        account.classification === "equity" &&
        /retained|earnings/i.test(account.name),
    )
  )
    findings.push(
      finding({
        code: "RETAINED_EARNINGS_REVIEW",
        severity: "info",
        title: "Retained earnings review",
        message: "A clear retained earnings account was not detected.",
        recommendation:
          "Confirm retained earnings treatment with an accountant before importing opening balances.",
        affectedRecords: [],
        blocksExport: false,
      }),
    );
  return findings;
}

function migrationPlanFindings(plan: MigrationPlan): ValidationFinding[] {
  return plan.exceptions.map((exception) =>
    finding({
      code: exception.code,
      severity: exception.severity,
      title: exception.code
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase()),
      message: exception.message,
      recommendation: exception.recommendation,
      entityType: exception.entityType,
      entityId: exception.entityId,
      affectedRecords: exception.entityId
        ? [
            {
              sourceId: exception.entityId,
              sourceType: exception.entityType,
              label: exception.entityName,
            },
          ]
        : [],
      blocksExport: exception.severity === "error",
    }),
  );
}

export function validateMigration(
  snapshot: AccountingSnapshot,
  plan: MigrationPlan,
): ValidationReport {
  const findings = [
    ...validateTrialBalance(snapshot),
    ...validateArApAgreement(snapshot),
    ...duplicateFindings(
      "contact",
      snapshot.contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        source: contact.source,
      })),
    ),
    ...duplicateFindings(
      "account",
      snapshot.accounts.map((account) => ({
        id: account.id,
        name: account.name,
        source: account.source,
      })),
    ),
    ...duplicateDocumentFindings("invoice", snapshot.invoices),
    ...duplicateDocumentFindings("bill", snapshot.bills),
    ...duplicateDocumentFindings("credit", snapshot.credits),
    ...validateInvoiceTotals(snapshot.invoices),
    ...validateBillTotals(snapshot.bills),
    ...validateCreditTotals(snapshot.credits),
    ...validateJournals(snapshot.journals),
    ...validateReferences(snapshot),
    ...validatePaymentAllocations(snapshot),
    ...validateMappings(snapshot, plan),
    ...validateTracking(snapshot),
    ...validateInactiveEntities(snapshot),
    ...validateCurrencies(snapshot),
    ...validateDates(snapshot),
    ...validateOpeningBalances(snapshot),
    ...validateScale(snapshot),
    ...snapshot.items
      .filter((item) => item.isInventory)
      .map((item) =>
        finding({
          code: "UNSUPPORTED_INVENTORY",
          severity: "warning" as const,
          title: "Inventory requires review",
          message: `${item.name} is an inventory item.`,
          recommendation:
            "Xero CSV migration requires inventory setup review before import.",
          entityType: "item",
          entityId: item.id,
          affectedRecords: [sourceRecord(item, item.name)],
          blocksExport: false,
        }),
      ),
    ...migrationPlanFindings(plan),
  ];

  const errorCount = findings.filter(
    (item) => item.severity === "error",
  ).length;
  const warningCount = findings.filter(
    (item) => item.severity === "warning",
  ).length;
  const infoCount = findings.filter((item) => item.severity === "info").length;
  const score = Math.max(
    0,
    Math.min(100, 100 - errorCount * 12 - warningCount * 4 - infoCount),
  );
  const readiness = findings.some((item) => item.blocksExport)
    ? "blocked"
    : warningCount > 0
      ? "review_needed"
      : "ready";

  const recommendations = [
    readiness === "ready"
      ? "The data is ready for a controlled Xero CSV migration."
      : "Resolve blocking errors before importing into Xero.",
    warningCount > 0
      ? "Review warnings with an accountant or PreconFin migration specialist."
      : "Keep a copy of the generated package for audit evidence.",
    "Import into a Xero demo organization first, then reconcile AR, AP, bank, retained earnings, and tax balances before go-live.",
  ];

  return {
    summary: {
      score,
      readiness,
      errorCount,
      warningCount,
      infoCount,
      generatedAt: new Date().toISOString(),
    },
    findings,
    recommendations,
  };
}

export type {
  AffectedSourceRecord,
  ValidationFinding,
  ValidationReport,
  ValidationSeverity,
  ValidationSummary,
} from "./types.js";
