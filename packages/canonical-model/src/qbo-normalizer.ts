import type {
  Account,
  AccountClassification,
  AccountingReports,
  AccountingSnapshot,
  Balance,
  Bill,
  Contact,
  Credit,
  Currency,
  Invoice,
  Item,
  Journal,
  Payment,
  ReportValue,
  TaxRate,
  TrackingCategory,
  TransactionLine,
  TransactionStatus
} from "./types.js";
import { compactId, firstString, lineAmount, money, normalizeDate, sourceRef, sumMoney } from "./utils.js";

export interface QboRawDataset {
  realmId: string;
  companyInfo: any;
  accounts: any[];
  customers: any[];
  vendors: any[];
  items: any[];
  invoices: any[];
  bills: any[];
  payments: any[];
  creditMemos: any[];
  vendorCredits: any[];
  journalEntries: any[];
  taxRates: any[];
  classes: any[];
  departments: any[];
  currencies: any[];
  reports: {
    trialBalance?: any;
    profitAndLoss?: any;
    balanceSheet?: any;
  };
  pulledAt?: string;
}

const accountTypeMap: Record<string, AccountClassification> = {
  Bank: "bank",
  "Accounts Receivable": "accounts_receivable",
  "Accounts Payable": "accounts_payable",
  OtherCurrentAsset: "asset",
  FixedAsset: "asset",
  OtherAsset: "asset",
  OtherCurrentLiability: "liability",
  LongTermLiability: "liability",
  Equity: "equity",
  Income: "revenue",
  OtherIncome: "revenue",
  Expense: "expense",
  CostOfGoodsSold: "expense",
  OtherExpense: "expense"
};

function accountClassification(type: unknown): AccountClassification {
  if (typeof type !== "string") return "other";
  return accountTypeMap[type] ?? "other";
}

function status(value: unknown): TransactionStatus {
  const raw = String(value || "").toLowerCase();
  if (["draft", "authorized", "paid", "void", "deleted"].includes(raw)) return raw as TransactionStatus;
  return "unknown";
}

function contactAddress(source: any): string | undefined {
  const addr = source?.BillAddr ?? source?.PrimaryAddr;
  if (!addr) return undefined;
  return [addr.Line1, addr.Line2, addr.City, addr.CountrySubDivisionCode, addr.PostalCode, addr.Country]
    .filter(Boolean)
    .join(", ");
}

function normalizeLines(lines: any[] | undefined, currency: string): TransactionLine[] {
  return (lines ?? [])
    .filter((line) => line?.DetailType && line?.Amount !== undefined)
    .map((line, index) => {
      const detail = line.SalesItemLineDetail ?? line.ItemBasedExpenseLineDetail ?? line.AccountBasedExpenseLineDetail ?? line.JournalEntryLineDetail ?? {};
      const accountRef = detail.AccountRef?.value;
      const itemRef = detail.ItemRef?.value;
      return {
        id: compactId("line", line.Id ?? index),
        description: firstString(line.Description, detail.Description),
        accountId: accountRef ? compactId("acct", accountRef) : undefined,
        itemId: itemRef ? compactId("item", itemRef) : undefined,
        quantity: detail.Qty === undefined ? undefined : Number(detail.Qty),
        unitAmount: detail.UnitPrice === undefined ? undefined : money(detail.UnitPrice, currency),
        amount: lineAmount(line, currency),
        taxRateId: detail.TaxCodeRef?.value ? compactId("tax", detail.TaxCodeRef.value) : undefined,
        tracking: {
          class: detail.ClassRef?.name,
          location: detail.DepartmentRef?.name
        }
      };
    });
}

function reportRows(report: any, currency: string): ReportValue[] {
  const rows: ReportValue[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node.Rows?.Row)) node.Rows.Row.forEach(walk);
    const cols = node.ColData;
    if (Array.isArray(cols) && cols.length >= 2) {
      const label = String(cols[0]?.value ?? "").trim();
      const rawAmount = cols[cols.length - 1]?.value;
      if (label && rawAmount !== undefined && rawAmount !== "") {
        rows.push({
          label,
          amount: money(String(rawAmount).replace(/,/g, ""), currency),
          accountId: cols[0]?.id ? compactId("acct", cols[0].id) : undefined
        });
      }
    }
  };
  report?.Rows?.Row?.forEach(walk);
  return rows;
}

export function normalizeQboDataset(raw: QboRawDataset): AccountingSnapshot {
  const company = raw.companyInfo?.CompanyInfo ?? raw.companyInfo ?? {};
  const baseCurrency = firstString(company.Country === "CA" ? "CAD" : undefined, company.CurrencyRef?.value, "USD") ?? "USD";
  const organization = {
    id: compactId("org", raw.realmId),
    source: sourceRef(raw.realmId, "company", company.MetaData ?? company),
    legalName: firstString(company.LegalName, company.CompanyName, "QuickBooks Company") ?? "QuickBooks Company",
    displayName: firstString(company.CompanyName, company.LegalName, "QuickBooks Company") ?? "QuickBooks Company",
    baseCurrency,
    country: firstString(company.Country),
    fiscalYearStartMonth: Number(company.FiscalYearStartMonth || 1),
    qboRealmId: raw.realmId
  };

  const accounts: Account[] = raw.accounts.map((account) => ({
    id: compactId("acct", account.Id),
    source: sourceRef(account.Id, "account", account),
    code: firstString(account.AcctNum),
    name: firstString(account.Name, account.FullyQualifiedName, account.Id) ?? String(account.Id),
    fullyQualifiedName: firstString(account.FullyQualifiedName),
    classification: accountClassification(account.AccountType),
    sourceAccountType: firstString(account.AccountType),
    sourceAccountSubType: firstString(account.AccountSubType),
    currency: firstString(account.CurrencyRef?.value, baseCurrency),
    active: account.Active !== false,
    parentId: account.ParentRef?.value ? compactId("acct", account.ParentRef.value) : undefined,
    currentBalance: money(account.CurrentBalance ?? 0, firstString(account.CurrencyRef?.value, baseCurrency))
  }));

  const customerContacts: Contact[] = raw.customers.map((customer) => ({
    id: compactId("contact_customer", customer.Id),
    source: sourceRef(customer.Id, "customer", customer),
    name: firstString(customer.DisplayName, customer.FullyQualifiedName, customer.CompanyName, customer.GivenName, customer.Id) ?? String(customer.Id),
    type: "customer",
    email: firstString(customer.PrimaryEmailAddr?.Address),
    phone: firstString(customer.PrimaryPhone?.FreeFormNumber),
    billingAddress: contactAddress(customer),
    active: customer.Active !== false,
    taxNumber: firstString(customer.TaxIdentifier)
  }));

  const supplierContacts: Contact[] = raw.vendors.map((vendor) => ({
    id: compactId("contact_supplier", vendor.Id),
    source: sourceRef(vendor.Id, "vendor", vendor),
    name: firstString(vendor.DisplayName, vendor.CompanyName, vendor.GivenName, vendor.Id) ?? String(vendor.Id),
    type: "supplier",
    email: firstString(vendor.PrimaryEmailAddr?.Address),
    phone: firstString(vendor.PrimaryPhone?.FreeFormNumber),
    billingAddress: contactAddress(vendor),
    active: vendor.Active !== false,
    taxNumber: firstString(vendor.TaxIdentifier)
  }));

  const items: Item[] = raw.items.map((item) => ({
    id: compactId("item", item.Id),
    source: sourceRef(item.Id, "item", item),
    name: firstString(item.Name, item.Sku, item.Id) ?? String(item.Id),
    description: firstString(item.Description),
    active: item.Active !== false,
    sku: firstString(item.Sku),
    unitPrice: item.UnitPrice === undefined ? undefined : money(item.UnitPrice, baseCurrency),
    purchasePrice: item.PurchaseCost === undefined ? undefined : money(item.PurchaseCost, baseCurrency),
    incomeAccountId: item.IncomeAccountRef?.value ? compactId("acct", item.IncomeAccountRef.value) : undefined,
    expenseAccountId: item.ExpenseAccountRef?.value ? compactId("acct", item.ExpenseAccountRef.value) : undefined,
    inventoryAssetAccountId: item.AssetAccountRef?.value ? compactId("acct", item.AssetAccountRef.value) : undefined,
    isInventory: item.Type === "Inventory"
  }));

  const invoices: Invoice[] = raw.invoices.map((invoice) => {
    const currency = firstString(invoice.CurrencyRef?.value, baseCurrency) ?? baseCurrency;
    const lines = normalizeLines(invoice.Line, currency);
    return {
      id: compactId("invoice", invoice.Id),
      source: sourceRef(invoice.Id, "invoice", invoice),
      number: firstString(invoice.DocNumber, invoice.Id) ?? String(invoice.Id),
      contactId: invoice.CustomerRef?.value ? compactId("contact_customer", invoice.CustomerRef.value) : undefined,
      issueDate: normalizeDate(invoice.TxnDate),
      dueDate: normalizeDate(invoice.DueDate),
      status: invoice.Balance === 0 ? "paid" : status(invoice.PrintStatus),
      lines,
      subtotal: sumMoney(lines.map((line) => line.amount), currency),
      tax: money(invoice.TxnTaxDetail?.TotalTax ?? 0, currency),
      total: money(invoice.TotalAmt ?? 0, currency),
      amountDue: money(invoice.Balance ?? 0, currency)
    };
  });

  const bills: Bill[] = raw.bills.map((bill) => {
    const currency = firstString(bill.CurrencyRef?.value, baseCurrency) ?? baseCurrency;
    const lines = normalizeLines(bill.Line, currency);
    return {
      id: compactId("bill", bill.Id),
      source: sourceRef(bill.Id, "bill", bill),
      number: firstString(bill.DocNumber, bill.Id) ?? String(bill.Id),
      contactId: bill.VendorRef?.value ? compactId("contact_supplier", bill.VendorRef.value) : undefined,
      issueDate: normalizeDate(bill.TxnDate),
      dueDate: normalizeDate(bill.DueDate),
      status: bill.Balance === 0 ? "paid" : "authorized",
      lines,
      subtotal: sumMoney(lines.map((line) => line.amount), currency),
      tax: money(bill.TxnTaxDetail?.TotalTax ?? 0, currency),
      total: money(bill.TotalAmt ?? 0, currency),
      amountDue: money(bill.Balance ?? 0, currency)
    };
  });

  const payments: Payment[] = raw.payments.map((payment) => ({
    id: compactId("payment", payment.Id),
    source: sourceRef(payment.Id, "payment", payment),
    number: firstString(payment.PaymentRefNum, payment.Id),
    contactId: payment.CustomerRef?.value ? compactId("contact_customer", payment.CustomerRef.value) : undefined,
    date: normalizeDate(payment.TxnDate),
    accountId: payment.DepositToAccountRef?.value ? compactId("acct", payment.DepositToAccountRef.value) : undefined,
    amount: money(payment.TotalAmt ?? payment.UnappliedAmt ?? 0, firstString(payment.CurrencyRef?.value, baseCurrency)),
    appliedTo: (payment.Line ?? []).flatMap((line: any) =>
      (line.LinkedTxn ?? []).map((txn: any) => ({ transactionId: compactId("txn", txn.TxnId), amount: money(line.Amount ?? 0, baseCurrency) }))
    )
  }));

  const credits: Credit[] = [
    ...raw.creditMemos.map((credit) => ({
      id: compactId("credit", credit.Id),
      source: sourceRef(credit.Id, "credit", credit),
      number: firstString(credit.DocNumber, credit.Id),
      contactId: credit.CustomerRef?.value ? compactId("contact_customer", credit.CustomerRef.value) : undefined,
      date: normalizeDate(credit.TxnDate),
      type: "customer-credit" as const,
      lines: normalizeLines(credit.Line, firstString(credit.CurrencyRef?.value, baseCurrency) ?? baseCurrency),
      total: money(credit.TotalAmt ?? 0, firstString(credit.CurrencyRef?.value, baseCurrency) ?? baseCurrency)
    })),
    ...raw.vendorCredits.map((credit) => ({
      id: compactId("supplier_credit", credit.Id),
      source: sourceRef(credit.Id, "credit", credit),
      number: firstString(credit.DocNumber, credit.Id),
      contactId: credit.VendorRef?.value ? compactId("contact_supplier", credit.VendorRef.value) : undefined,
      date: normalizeDate(credit.TxnDate),
      type: "supplier-credit" as const,
      lines: normalizeLines(credit.Line, firstString(credit.CurrencyRef?.value, baseCurrency) ?? baseCurrency),
      total: money(credit.TotalAmt ?? 0, firstString(credit.CurrencyRef?.value, baseCurrency) ?? baseCurrency)
    }))
  ];

  const journals: Journal[] = raw.journalEntries.map((journal) => ({
    id: compactId("journal", journal.Id),
    source: sourceRef(journal.Id, "journal", journal),
    number: firstString(journal.DocNumber, journal.Id),
    date: normalizeDate(journal.TxnDate),
    narration: firstString(journal.PrivateNote),
    lines: (journal.Line ?? []).map((line: any, index: number) => {
      const detail = line.JournalEntryLineDetail ?? {};
      return {
        id: compactId("journal_line", line.Id ?? index),
        description: firstString(line.Description),
        accountId: detail.AccountRef?.value ? compactId("acct", detail.AccountRef.value) : undefined,
        amount: money(line.Amount ?? 0, baseCurrency),
        side: detail.PostingType === "Credit" ? "credit" as const : "debit" as const
      };
    })
  }));

  const taxRates: TaxRate[] = raw.taxRates.map((taxRate) => ({
    id: compactId("tax", taxRate.Id),
    source: sourceRef(taxRate.Id, "tax-rate", taxRate),
    name: firstString(taxRate.Name, taxRate.Id) ?? String(taxRate.Id),
    rate: Number(taxRate.RateValue ?? 0),
    active: taxRate.Active !== false,
    agency: firstString(taxRate.AgencyRef?.name)
  }));

  const currencies: Currency[] = raw.currencies.length
    ? raw.currencies.map((currency) => ({
        id: compactId("currency", currency.Code ?? currency.Name),
        source: sourceRef(currency.Id ?? currency.Code ?? currency.Name, "currency", currency),
        code: firstString(currency.Code, currency.Name, baseCurrency) ?? baseCurrency,
        name: firstString(currency.Name),
        exchangeRate: currency.ExchangeRate ? Number(currency.ExchangeRate) : undefined,
        active: currency.Active !== false
      }))
    : [{ id: compactId("currency", baseCurrency), source: sourceRef(baseCurrency, "currency", { base: true }), code: baseCurrency, active: true }];

  const tracking: TrackingCategory[] = [
    ...raw.classes.map((item) => ({
      id: compactId("class", item.Id),
      source: sourceRef(item.Id, "tracking", item),
      name: "Class",
      option: firstString(item.Name, item.FullyQualifiedName, item.Id) ?? String(item.Id),
      active: item.Active !== false
    })),
    ...raw.departments.map((item) => ({
      id: compactId("department", item.Id),
      source: sourceRef(item.Id, "tracking", item),
      name: "Location",
      option: firstString(item.Name, item.FullyQualifiedName, item.Id) ?? String(item.Id),
      active: item.Active !== false
    }))
  ];

  const reports: AccountingReports = {
    trialBalance: reportRows(raw.reports.trialBalance, baseCurrency),
    profitAndLoss: reportRows(raw.reports.profitAndLoss, baseCurrency),
    balanceSheet: reportRows(raw.reports.balanceSheet, baseCurrency)
  };

  const balances: Balance[] = reports.trialBalance.map((row) => ({
    id: compactId("balance", row.accountId ?? row.label),
    source: sourceRef(row.accountId ?? row.label, "balance", { ...row }),
    accountId: row.accountId ?? compactId("acct_label", row.label),
    asOfDate: new Date().toISOString().slice(0, 10),
    amount: row.amount,
    basis: "trial-balance"
  }));

  return {
    organization,
    accounts,
    contacts: [...customerContacts, ...supplierContacts],
    items,
    invoices,
    bills,
    payments,
    credits,
    journals,
    taxRates,
    currencies,
    tracking,
    balances,
    reports,
    pulledAt: raw.pulledAt ?? new Date().toISOString()
  };
}
