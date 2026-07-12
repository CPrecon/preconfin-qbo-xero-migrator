import type {
  AccountingSnapshot,
  SourceType,
} from "@preconfin/canonical-model";

function source(sourceId: string, sourceType: SourceType) {
  return {
    sourceSystem: "quickbooks-online" as const,
    sourceId,
    sourceType,
    metadata: {},
  };
}

export function accountingFixture(): AccountingSnapshot {
  return {
    organization: {
      id: "org_1",
      legalName: "Harbor Logistics LLC",
      displayName: "Harbor Logistics",
      baseCurrency: "USD",
      qboRealmId: "realm_1",
      source: source("realm_1", "company"),
    },
    accounts: [
      {
        id: "acct_bank",
        code: "100",
        name: "Operating Bank",
        classification: "bank",
        active: true,
        source: source("1", "account"),
      },
      {
        id: "acct_ar",
        code: "120",
        name: "Accounts Receivable",
        classification: "accounts_receivable",
        active: true,
        source: source("2", "account"),
      },
      {
        id: "acct_ap",
        code: "200",
        name: "Accounts Payable",
        classification: "accounts_payable",
        active: true,
        source: source("3", "account"),
      },
      {
        id: "acct_rev",
        code: "400",
        name: "Service Revenue",
        classification: "revenue",
        active: true,
        source: source("4", "account"),
      },
      {
        id: "acct_exp",
        code: "500",
        name: "Materials Expense",
        classification: "expense",
        active: true,
        source: source("5", "account"),
      },
      {
        id: "acct_equity",
        code: "800",
        name: "Retained Earnings",
        classification: "equity",
        active: true,
        source: source("6", "account"),
      },
    ],
    contacts: [
      {
        id: "contact_customer_1",
        name: "Acme Corp",
        type: "customer",
        active: true,
        email: "ap@example.invalid",
        source: source("1", "customer"),
      },
      {
        id: "contact_supplier_1",
        name: "Supply Co",
        type: "supplier",
        active: true,
        source: source("2", "vendor"),
      },
    ],
    items: [
      {
        id: "item_1",
        name: "Implementation",
        active: true,
        sku: "IMPL",
        isInventory: false,
        incomeAccountId: "acct_rev",
        expenseAccountId: "acct_exp",
        unitPrice: { amount: 100, currency: "USD" },
        source: source("1", "item"),
      },
    ],
    invoices: [
      {
        id: "invoice_1",
        number: "INV-100",
        contactId: "contact_customer_1",
        issueDate: "2026-01-01",
        dueDate: "2026-01-31",
        status: "authorized",
        lines: [
          {
            id: "line_1",
            description: "Implementation",
            accountId: "acct_rev",
            itemId: "item_1",
            quantity: 1,
            unitAmount: { amount: 100, currency: "USD" },
            amount: { amount: 100, currency: "USD" },
            taxRateId: "tax_1",
          },
        ],
        subtotal: { amount: 100, currency: "USD" },
        tax: { amount: 0, currency: "USD" },
        total: { amount: 100, currency: "USD" },
        amountDue: { amount: 100, currency: "USD" },
        source: source("100", "invoice"),
      },
    ],
    bills: [
      {
        id: "bill_1",
        number: "BILL-50",
        contactId: "contact_supplier_1",
        issueDate: "2026-01-02",
        dueDate: "2026-02-01",
        status: "authorized",
        lines: [
          {
            id: "line_2",
            description: "Materials",
            accountId: "acct_exp",
            itemId: "item_1",
            quantity: 1,
            unitAmount: { amount: 50, currency: "USD" },
            amount: { amount: 50, currency: "USD" },
            taxRateId: "tax_1",
          },
        ],
        subtotal: { amount: 50, currency: "USD" },
        tax: { amount: 0, currency: "USD" },
        total: { amount: 50, currency: "USD" },
        amountDue: { amount: 50, currency: "USD" },
        source: source("50", "bill"),
      },
    ],
    payments: [
      {
        id: "payment_1",
        number: "PMT-100",
        contactId: "contact_customer_1",
        date: "2026-01-15",
        accountId: "acct_bank",
        amount: { amount: 100, currency: "USD" },
        appliedTo: [
          {
            transactionId: "invoice_1",
            amount: { amount: 100, currency: "USD" },
          },
        ],
        source: source("900", "payment"),
      },
    ],
    credits: [
      {
        id: "credit_1",
        number: "CM-10",
        contactId: "contact_customer_1",
        date: "2026-01-20",
        type: "customer-credit",
        lines: [
          {
            id: "line_3",
            description: "Credit",
            accountId: "acct_rev",
            amount: { amount: 10, currency: "USD" },
          },
        ],
        total: { amount: 10, currency: "USD" },
        source: source("700", "credit"),
      },
    ],
    journals: [
      {
        id: "journal_1",
        number: "JE-1",
        date: "2026-01-31",
        narration: "Accrual",
        lines: [
          {
            id: "jl_1",
            accountId: "acct_exp",
            amount: { amount: 25, currency: "USD" },
            side: "debit",
          },
          {
            id: "jl_2",
            accountId: "acct_ap",
            amount: { amount: 25, currency: "USD" },
            side: "credit",
          },
        ],
        source: source("800", "journal"),
      },
    ],
    taxRates: [
      {
        id: "tax_1",
        name: "No Tax",
        rate: 0,
        active: true,
        source: source("NON", "tax-rate"),
      },
    ],
    currencies: [
      {
        id: "currency_USD",
        code: "USD",
        active: true,
        source: source("USD", "currency"),
      },
    ],
    tracking: [],
    balances: [
      {
        id: "balance_bank",
        accountId: "acct_bank",
        asOfDate: "2026-01-31",
        amount: { amount: 0, currency: "USD" },
        basis: "trial-balance",
        source: source("balance_bank", "balance"),
      },
    ],
    reports: {
      trialBalance: [
        {
          label: "Operating Bank",
          accountId: "acct_bank",
          amount: { amount: 0, currency: "USD" },
        },
      ],
      profitAndLoss: [],
      balanceSheet: [],
      arAging: [
        { label: "Acme Corp", amount: { amount: 100, currency: "USD" } },
      ],
      apAging: [
        { label: "Supply Co", amount: { amount: 50, currency: "USD" } },
      ],
    },
    pulledAt: "2026-01-31T00:00:00.000Z",
  };
}
