export type SourceSystem = "quickbooks-online" | "xero" | "manual";

export type SourceType =
  | "company"
  | "account"
  | "customer"
  | "vendor"
  | "item"
  | "invoice"
  | "bill"
  | "payment"
  | "credit"
  | "journal"
  | "tax-rate"
  | "currency"
  | "tracking"
  | "balance"
  | "report";

export type AccountClassification =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense"
  | "bank"
  | "accounts_receivable"
  | "accounts_payable"
  | "other";

export type ContactType = "customer" | "supplier" | "both";
export type TransactionStatus = "draft" | "authorized" | "paid" | "void" | "deleted" | "unknown";

export interface SourceReference {
  sourceSystem: SourceSystem;
  sourceId: string;
  sourceType: SourceType;
  sourceTimestamp?: string;
  metadata: Record<string, unknown>;
}

export interface MoneyAmount {
  amount: number;
  currency: string;
}

export interface CanonicalEntity {
  id: string;
  source: SourceReference;
  createdAt?: string;
  updatedAt?: string;
}

export interface Organization extends CanonicalEntity {
  legalName: string;
  displayName: string;
  baseCurrency: string;
  country?: string;
  fiscalYearStartMonth?: number;
  qboRealmId?: string;
}

export interface Account extends CanonicalEntity {
  code?: string;
  name: string;
  fullyQualifiedName?: string;
  classification: AccountClassification;
  sourceAccountType?: string;
  sourceAccountSubType?: string;
  currency?: string;
  active: boolean;
  parentId?: string;
  currentBalance?: MoneyAmount;
}

export interface Contact extends CanonicalEntity {
  name: string;
  type: ContactType;
  email?: string;
  phone?: string;
  billingAddress?: string;
  active: boolean;
  taxNumber?: string;
}

export interface Item extends CanonicalEntity {
  name: string;
  description?: string;
  active: boolean;
  sku?: string;
  unitPrice?: MoneyAmount;
  purchasePrice?: MoneyAmount;
  incomeAccountId?: string;
  expenseAccountId?: string;
  inventoryAssetAccountId?: string;
  isInventory: boolean;
}

export interface TaxRate extends CanonicalEntity {
  name: string;
  rate: number;
  active: boolean;
  agency?: string;
}

export interface Currency extends CanonicalEntity {
  code: string;
  name?: string;
  exchangeRate?: number;
  active: boolean;
}

export interface TrackingCategory extends CanonicalEntity {
  name: string;
  option: string;
  active: boolean;
}

export interface TransactionLine {
  id: string;
  description?: string;
  accountId?: string;
  itemId?: string;
  contactId?: string;
  quantity?: number;
  unitAmount?: MoneyAmount;
  amount: MoneyAmount;
  taxRateId?: string;
  tracking?: Record<string, string>;
}

export interface Invoice extends CanonicalEntity {
  number: string;
  contactId?: string;
  issueDate?: string;
  dueDate?: string;
  status: TransactionStatus;
  lines: TransactionLine[];
  subtotal: MoneyAmount;
  tax: MoneyAmount;
  total: MoneyAmount;
  amountDue?: MoneyAmount;
}

export interface Bill extends CanonicalEntity {
  number: string;
  contactId?: string;
  issueDate?: string;
  dueDate?: string;
  status: TransactionStatus;
  lines: TransactionLine[];
  subtotal: MoneyAmount;
  tax: MoneyAmount;
  total: MoneyAmount;
  amountDue?: MoneyAmount;
}

export interface Payment extends CanonicalEntity {
  number?: string;
  contactId?: string;
  date?: string;
  accountId?: string;
  amount: MoneyAmount;
  appliedTo: Array<{ transactionId: string; amount: MoneyAmount }>;
}

export interface Credit extends CanonicalEntity {
  number?: string;
  contactId?: string;
  date?: string;
  type: "customer-credit" | "supplier-credit";
  lines: TransactionLine[];
  total: MoneyAmount;
}

export interface Journal extends CanonicalEntity {
  number?: string;
  date?: string;
  narration?: string;
  lines: Array<TransactionLine & { side: "debit" | "credit" }>;
}

export interface Balance extends CanonicalEntity {
  accountId: string;
  asOfDate: string;
  amount: MoneyAmount;
  basis: "trial-balance" | "opening-balance" | "report";
}

export interface ReportValue {
  label: string;
  amount: MoneyAmount;
  accountId?: string;
}

export interface AccountingReports {
  trialBalance: ReportValue[];
  profitAndLoss: ReportValue[];
  balanceSheet: ReportValue[];
}

export interface AccountingSnapshot {
  organization: Organization;
  accounts: Account[];
  contacts: Contact[];
  items: Item[];
  invoices: Invoice[];
  bills: Bill[];
  payments: Payment[];
  credits: Credit[];
  journals: Journal[];
  taxRates: TaxRate[];
  currencies: Currency[];
  tracking: TrackingCategory[];
  balances: Balance[];
  reports: AccountingReports;
  pulledAt: string;
}
