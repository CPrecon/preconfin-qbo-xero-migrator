import type {
  Account,
  AccountingSnapshot,
  Balance,
  Bill,
  Contact,
  Currency,
  Invoice,
  Item,
  Journal,
  MoneyAmount,
  SourceReference,
  SourceType,
  TaxCode,
  TaxRate,
  TrackingCategory,
} from "@preconfin/canonical-model";
import {
  createMigrationPlan,
  type MigrationPlan,
} from "@preconfin/migration-engine";

export const FIXTURE_GENERATED_AT = "2026-06-30T12:00:00.000Z";
export const FIXTURE_PULLED_AT = "2026-06-30T11:30:00.000Z";

export const FIXTURE_NAMES = [
  "clean-company",
  "service-business",
  "inventory-business",
  "construction-company",
  "manufacturing-company",
  "messy-books",
  "migration-edge-cases",
] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];

function source(sourceType: SourceType, sourceId: string): SourceReference {
  return {
    sourceSystem: "quickbooks-online",
    sourceId,
    sourceType,
    sourceTimestamp: FIXTURE_PULLED_AT,
    metadata: {},
  };
}

function money(amount: number, currency = "USD"): MoneyAmount {
  return { amount, currency };
}

function account(input: {
  id: string;
  code: string;
  name: string;
  classification: Account["classification"];
  sourceAccountType: string;
  sourceAccountSubType?: string;
  currentBalance?: number;
  active?: boolean;
}): Account {
  return {
    id: input.id,
    code: input.code,
    name: input.name,
    classification: input.classification,
    sourceAccountType: input.sourceAccountType,
    sourceAccountSubType: input.sourceAccountSubType,
    currentBalance:
      input.currentBalance === undefined
        ? undefined
        : money(input.currentBalance),
    currency: "USD",
    active: input.active ?? true,
    source: source("account", input.id),
  };
}

function contact(id: string, name: string, type: Contact["type"]): Contact {
  return {
    id,
    name,
    type,
    active: true,
    source: source(type === "supplier" ? "vendor" : "customer", id),
  };
}

function serviceItem(): Item {
  return {
    id: "item_service",
    name: "Professional services",
    active: true,
    incomeAccountId: "acct_revenue",
    expenseAccountId: "acct_expense",
    isInventory: false,
    source: source("item", "item_service"),
  };
}

function baseAccounts(): Account[] {
  return [
    account({
      id: "acct_bank",
      code: "1000",
      name: "Operating Bank",
      classification: "bank",
      sourceAccountType: "Bank",
      currentBalance: 10_000,
    }),
    account({
      id: "acct_ar",
      code: "1100",
      name: "Accounts Receivable",
      classification: "accounts_receivable",
      sourceAccountType: "Accounts Receivable",
    }),
    account({
      id: "acct_ap",
      code: "2000",
      name: "Accounts Payable",
      classification: "accounts_payable",
      sourceAccountType: "Accounts Payable",
    }),
    account({
      id: "acct_retained",
      code: "3200",
      name: "Retained Earnings",
      classification: "equity",
      sourceAccountType: "Equity",
      sourceAccountSubType: "RetainedEarnings",
    }),
    account({
      id: "acct_revenue",
      code: "4000",
      name: "Service Revenue",
      classification: "revenue",
      sourceAccountType: "Income",
    }),
    account({
      id: "acct_expense",
      code: "5000",
      name: "Operating Expense",
      classification: "expense",
      sourceAccountType: "Expense",
    }),
  ];
}

function baseInvoice(): Invoice {
  return {
    id: "invoice_1",
    number: "INV-1001",
    contactId: "customer_1",
    issueDate: "2026-06-01",
    dueDate: "2026-06-30",
    status: "authorized",
    lines: [
      {
        id: "invoice_line_1",
        kind: "item",
        itemId: "item_service",
        accountId: "acct_revenue",
        accountResolution: "item_income",
        amount: money(1_000),
      },
    ],
    subtotal: money(1_000),
    tax: money(0),
    total: money(1_000),
    amountDue: money(1_000),
    normalization: {
      taxCalculation: "not_applicable",
      discount: money(0),
      shipping: money(0),
      calculatedTotal: money(1_000),
      rounding: money(0),
    },
    source: source("invoice", "invoice_1"),
  };
}

function baseBill(): Bill {
  return {
    id: "bill_1",
    number: "BILL-1001",
    contactId: "supplier_1",
    issueDate: "2026-06-10",
    dueDate: "2026-07-10",
    status: "authorized",
    lines: [
      {
        id: "bill_line_1",
        kind: "account",
        accountId: "acct_expense",
        amount: money(500),
      },
    ],
    subtotal: money(500),
    tax: money(0),
    total: money(500),
    amountDue: money(500),
    normalization: {
      taxCalculation: "not_applicable",
      discount: money(0),
      shipping: money(0),
      calculatedTotal: money(500),
      rounding: money(0),
    },
    source: source("bill", "bill_1"),
  };
}

function balance(accountId: string, amount: number): Balance {
  return {
    id: "balance_" + accountId,
    accountId,
    asOfDate: "2026-06-30",
    amount: money(amount),
    basis: "trial-balance",
    source: source("balance", "balance_" + accountId),
  };
}

function reportRow(label: string, accountId: string, amount: number) {
  return { label, accountId, amount: money(amount) };
}

function baseSnapshot(displayName: string): AccountingSnapshot {
  const trialBalance = [
    reportRow("Operating Bank", "acct_bank", 10_000),
    reportRow("Accounts Receivable", "acct_ar", 1_000),
    reportRow("Accounts Payable", "acct_ap", -500),
    reportRow("Retained Earnings", "acct_retained", -5_000),
    reportRow("Service Revenue", "acct_revenue", -7_000),
    reportRow("Operating Expense", "acct_expense", 1_500),
  ];
  return {
    organization: {
      id: "org_" + displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      legalName: displayName + " LLC",
      displayName,
      baseCurrency: "USD",
      country: "US",
      source: source("company", "company_1"),
    },
    accounts: baseAccounts(),
    contacts: [
      contact("customer_1", "Acme Customer", "customer"),
      contact("supplier_1", "Office Supplier", "supplier"),
    ],
    items: [serviceItem()],
    invoices: [baseInvoice()],
    bills: [baseBill()],
    payments: [],
    credits: [],
    journals: [],
    taxRates: [],
    taxCodes: [],
    currencies: [
      {
        id: "currency_USD",
        code: "USD",
        name: "US Dollar",
        active: true,
        source: source("currency", "USD"),
      } satisfies Currency,
    ],
    tracking: [],
    balances: trialBalance.map((row) =>
      balance(row.accountId, row.amount.amount),
    ),
    reports: {
      trialBalance,
      profitAndLoss: [
        reportRow("Service Revenue", "acct_revenue", -7_000),
        reportRow("Operating Expense", "acct_expense", 1_500),
      ],
      balanceSheet: trialBalance
        .filter((row) =>
          ["acct_bank", "acct_ar", "acct_ap", "acct_retained"].includes(
            row.accountId,
          ),
        )
        .map((row) => ({ ...row, amount: { ...row.amount } })),
      arAging: [reportRow("Accounts Receivable", "acct_ar", 1_000)],
      apAging: [reportRow("Accounts Payable", "acct_ap", 500)],
      metadata: Object.fromEntries(
        [
          "trialBalance",
          "profitAndLoss",
          "balanceSheet",
          "arAging",
          "apAging",
        ].map((name) => [
          name,
          {
            name,
            basis: "accrual" as const,
            startDate: "2026-01-01",
            endDate: "2026-06-30",
            generatedAt: FIXTURE_PULLED_AT,
            currency: "USD",
            noData: false,
          },
        ]),
      ),
    },
    pulledAt: FIXTURE_PULLED_AT,
  };
}

function serviceBusiness(): AccountingSnapshot {
  const snapshot = baseSnapshot("Northwind Advisory");
  snapshot.invoices[0]!.lines = [
    {
      id: "invoice_line_service",
      kind: "item",
      itemId: "item_service",
      accountId: "acct_revenue",
      accountResolution: "item_income",
      amount: money(950),
      taxInclusiveAmount: money(950),
    },
    {
      id: "invoice_line_shipping",
      kind: "shipping",
      accountId: "acct_revenue",
      amount: money(75),
      taxInclusiveAmount: money(75),
    },
    {
      id: "invoice_line_discount",
      kind: "discount",
      accountId: "acct_revenue",
      amount: money(-25),
      discountAmount: money(25),
      taxInclusiveAmount: money(-25),
    },
  ];
  snapshot.invoices[0]!.subtotal = money(925);
  snapshot.invoices[0]!.tax = money(75);
  snapshot.invoices[0]!.normalization = {
    taxCalculation: "tax_inclusive",
    discount: money(25),
    shipping: money(75),
    calculatedTotal: money(999.99),
    rounding: money(0.01),
  };
  return snapshot;
}

function inventoryBusiness(): AccountingSnapshot {
  const snapshot = baseSnapshot("Atlas Retail");
  snapshot.accounts.push(
    account({
      id: "acct_inventory",
      code: "1200",
      name: "Inventory Asset",
      classification: "asset",
      sourceAccountType: "Other Current Asset",
      sourceAccountSubType: "Inventory",
    }),
    account({
      id: "acct_cogs",
      code: "5100",
      name: "Cost of Goods Sold",
      classification: "expense",
      sourceAccountType: "Cost of Goods Sold",
    }),
  );
  snapshot.items.push({
    id: "item_inventory",
    name: "Field Kit",
    active: true,
    sku: "KIT-100",
    incomeAccountId: "acct_revenue",
    expenseAccountId: "acct_cogs",
    inventoryAssetAccountId: "acct_inventory",
    isInventory: true,
    source: source("item", "item_inventory"),
  });
  return snapshot;
}

function constructionCompany(): AccountingSnapshot {
  const snapshot = baseSnapshot("Summit Construction");
  snapshot.tracking = [
    {
      id: "tracking_project_north",
      name: "Project",
      option: "North Site",
      active: true,
      source: source("tracking", "class_north"),
    },
    {
      id: "tracking_region_west",
      name: "Region",
      option: "West",
      active: true,
      source: source("tracking", "location_west"),
    },
  ] satisfies TrackingCategory[];
  snapshot.invoices[0]!.lines[0]!.tracking = {
    Project: "North Site",
    Region: "West",
  };
  return snapshot;
}

function manufacturingCompany(): AccountingSnapshot {
  const snapshot = baseSnapshot("Atlas Manufacturing");
  const additions = [
    account({
      id: "acct_fixed",
      code: "1500",
      name: "Production Equipment",
      classification: "asset",
      sourceAccountType: "Fixed Asset",
      sourceAccountSubType: "MachineryAndEquipment",
    }),
    account({
      id: "acct_accumulated",
      code: "1510",
      name: "Accumulated Depreciation",
      classification: "asset",
      sourceAccountType: "Fixed Asset",
      sourceAccountSubType: "AccumulatedDepreciation",
    }),
    account({
      id: "acct_cogs",
      code: "5100",
      name: "Cost of Goods Sold",
      classification: "expense",
      sourceAccountType: "Cost of Goods Sold",
    }),
    account({
      id: "acct_credit_card",
      code: "2100",
      name: "Corporate Card",
      classification: "liability",
      sourceAccountType: "Credit Card",
      currentBalance: -200,
    }),
    account({
      id: "acct_tax",
      code: "2200",
      name: "Sales Tax Payable",
      classification: "liability",
      sourceAccountType: "Other Current Liability",
      sourceAccountSubType: "SalesTaxPayable",
    }),
  ];
  snapshot.accounts.push(...additions);
  const extraRows = [
    reportRow("Production Equipment", "acct_fixed", 500),
    reportRow("Accumulated Depreciation", "acct_accumulated", -100),
    reportRow("Cost of Goods Sold", "acct_cogs", 300),
    reportRow("Corporate Card", "acct_credit_card", -200),
    reportRow("Sales Tax Payable", "acct_tax", -50),
  ];
  snapshot.reports.trialBalance.find(
    (row) => row.accountId === "acct_revenue",
  )!.amount = money(-7_450);
  snapshot.reports.profitAndLoss.find(
    (row) => row.accountId === "acct_revenue",
  )!.amount = money(-7_450);
  snapshot.reports.profitAndLoss.push(extraRows[2]!);
  snapshot.reports.trialBalance.push(...extraRows);
  snapshot.reports.balanceSheet.push(
    extraRows[0]!,
    extraRows[1]!,
    extraRows[3]!,
    extraRows[4]!,
  );
  snapshot.balances = snapshot.reports.trialBalance.map((row) =>
    balance(row.accountId!, row.amount.amount),
  );
  snapshot.taxRates = [
    {
      id: "tax_rate_standard",
      name: "Standard Sales Tax",
      rate: 5,
      active: true,
      source: source("tax-rate", "tax_rate_standard"),
    } satisfies TaxRate,
  ];
  snapshot.taxCodes = [
    {
      id: "tax_code_tax",
      name: "Tax",
      active: true,
      taxable: true,
      salesRate: 5,
      purchaseRate: 5,
      componentRateIds: ["tax_rate_standard"],
      source: source("tax-code", "tax_code_tax"),
    } satisfies TaxCode,
  ];
  return snapshot;
}

function messyBooks(): AccountingSnapshot {
  const snapshot = baseSnapshot("Messy Books Company");
  snapshot.contacts.push(
    contact("customer_duplicate", "Acme Customer", "customer"),
  );
  snapshot.accounts.push(
    account({
      id: "acct_expense_duplicate",
      code: "5000",
      name: "Operating Expense",
      classification: "expense",
      sourceAccountType: "Expense",
    }),
  );
  snapshot.accounts.find(
    (candidate) => candidate.id === "acct_expense",
  )!.active = false;
  snapshot.invoices[0]!.lines = [
    {
      id: "missing_account_1",
      kind: "item",
      amount: money(400),
    },
    {
      id: "missing_account_2",
      kind: "item",
      amount: money(400),
    },
  ];
  snapshot.invoices[0]!.normalization = {
    taxCalculation: "not_applicable",
    discount: money(0),
    shipping: money(0),
    calculatedTotal: money(800),
    rounding: money(0),
  };
  const secondInvoice = baseInvoice();
  secondInvoice.id = "invoice_2";
  secondInvoice.source = source("invoice", "invoice_2");
  secondInvoice.total = money(100);
  secondInvoice.amountDue = money(100);
  secondInvoice.subtotal = money(100);
  secondInvoice.lines[0]!.id = "invoice_line_2";
  secondInvoice.lines[0]!.amount = money(100);
  secondInvoice.normalization = {
    taxCalculation: "not_applicable",
    discount: money(0),
    shipping: money(0),
    calculatedTotal: money(100),
    rounding: money(0),
  };
  snapshot.invoices.push(secondInvoice);
  snapshot.bills[0]!.contactId = "missing_supplier";
  snapshot.journals = [
    {
      id: "journal_unbalanced",
      number: "JRN-1",
      date: "2026-06-30",
      lines: [
        {
          id: "journal_debit",
          accountId: "acct_bank",
          amount: money(100),
          side: "debit",
        },
        {
          id: "journal_credit",
          accountId: "acct_revenue",
          amount: money(80),
          side: "credit",
        },
      ],
      source: source("journal", "journal_unbalanced"),
    } satisfies Journal,
  ];
  snapshot.accounts.find(
    (candidate) => candidate.id === "acct_bank",
  )!.currentBalance = money(9_000);
  snapshot.reports.trialBalance[0]!.amount = money(10_050);
  snapshot.reports.balanceSheet.find(
    (row) => row.accountId === "acct_retained",
  )!.amount = money(-4_800);
  snapshot.reports.arAging[0]!.amount = money(700);
  snapshot.reports.apAging[0]!.amount = money(400);
  snapshot.balances[0]!.amount = money(10_050);
  return snapshot;
}

function migrationEdgeCases(): AccountingSnapshot {
  const snapshot = baseSnapshot("Migration Edge Cases");
  snapshot.accounts.push(
    account({
      id: "acct_nonposting",
      code: "ACCOUNT-CODE-TOO-LONG",
      name: "Non-posting Control",
      classification: "other",
      sourceAccountType: "Non-Posting",
      currentBalance: 1,
    }),
  );
  snapshot.tracking = ["One", "Two", "Three"].map(
    (name, index) =>
      ({
        id: "tracking_" + index,
        name,
        option: "Default",
        active: true,
        source: source("tracking", "tracking_" + index),
      }) satisfies TrackingCategory,
  );
  snapshot.invoices[0]!.lines[0]!.taxCodeId = "missing_tax_code";
  snapshot.invoices[0]!.total = money(1_000, "EUR");
  snapshot.invoices[0]!.subtotal = money(1_000, "EUR");
  snapshot.invoices[0]!.amountDue = money(1_000, "EUR");
  snapshot.invoices[0]!.normalization = {
    taxCalculation: "unknown",
    discount: money(0, "EUR"),
    shipping: money(0, "EUR"),
    calculatedTotal: money(1_000, "EUR"),
    rounding: money(0, "EUR"),
  };
  snapshot.payments.push({
    id: "payment_orphan",
    number: "PMT-1",
    contactId: "customer_1",
    date: "2026-06-20",
    accountId: "acct_bank",
    amount: money(50),
    appliedTo: [
      {
        transactionId: "missing_invoice",
        amount: money(50),
      },
    ],
    source: source("payment", "payment_orphan"),
  });
  snapshot.reports.trialBalance = [];
  snapshot.reports.balanceSheet = [];
  snapshot.balances = [];
  return snapshot;
}

export interface AssessmentFixture {
  readonly snapshot: AccountingSnapshot;
  readonly plan: MigrationPlan;
}

export function createAssessmentFixture(name: FixtureName): AssessmentFixture {
  const snapshot =
    name === "service-business"
      ? serviceBusiness()
      : name === "inventory-business"
        ? inventoryBusiness()
        : name === "construction-company"
          ? constructionCompany()
          : name === "manufacturing-company"
            ? manufacturingCompany()
            : name === "messy-books"
              ? messyBooks()
              : name === "migration-edge-cases"
                ? migrationEdgeCases()
                : baseSnapshot("Evergreen Advisory");
  const plan = createMigrationPlan(snapshot);
  return {
    snapshot,
    plan: { ...plan, generatedAt: FIXTURE_GENERATED_AT },
  };
}
