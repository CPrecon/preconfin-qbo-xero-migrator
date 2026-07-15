import { describe, expect, it } from "vitest";
import { normalizeQboDataset, type QboRawDataset } from "./qbo-normalizer.js";

function dataset(overrides: Partial<QboRawDataset> = {}): QboRawDataset {
  return {
    realmId: "123",
    companyInfo: {
      CompanyName: "Harbor Logistics",
      Country: "US",
      CurrencyRef: { value: "USD" },
    },
    accounts: [],
    customers: [],
    vendors: [],
    items: [],
    invoices: [],
    bills: [],
    payments: [],
    creditMemos: [],
    vendorCredits: [],
    journalEntries: [],
    taxRates: [],
    taxCodes: [],
    classes: [],
    departments: [],
    currencies: [],
    reports: {},
    pulledAt: "2026-06-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeQboDataset", () => {
  it("resolves invoice and bill accounts through referenced items", () => {
    const snapshot = normalizeQboDataset(
      dataset({
        accounts: [
          { Id: "income", Name: "Sales", AccountType: "Income" },
          { Id: "expense", Name: "Purchases", AccountType: "Expense" },
          {
            Id: "undeposited",
            Name: "Undeposited Funds",
            AccountType: "Other Current Asset",
          },
          { Id: "credit-card", Name: "Credit Card", AccountType: "CreditCard" },
          { Id: "payables", Name: "Payables", AccountType: "Accounts Payable" },
        ],
        items: [
          {
            Id: "service",
            Name: "Advisory",
            Type: "Service",
            IncomeAccountRef: { value: "income" },
            ExpenseAccountRef: { value: "expense" },
          },
        ],
        invoices: [
          {
            Id: "invoice",
            TotalAmt: 100,
            Line: [
              {
                Id: "invoice-line",
                DetailType: "SalesItemLineDetail",
                Amount: 100,
                SalesItemLineDetail: { ItemRef: { value: "service" } },
              },
            ],
          },
        ],
        bills: [
          {
            Id: "bill",
            TotalAmt: 50,
            Line: [
              {
                Id: "bill-line",
                DetailType: "ItemBasedExpenseLineDetail",
                Amount: 50,
                ItemBasedExpenseLineDetail: { ItemRef: { value: "service" } },
              },
            ],
          },
        ],
      }),
    );

    expect(snapshot.invoices[0]?.lines[0]).toMatchObject({
      accountId: "acct_income",
      accountResolution: "item_income",
    });
    expect(snapshot.bills[0]?.lines[0]).toMatchObject({
      accountId: "acct_expense",
      accountResolution: "item_expense",
    });
    expect(
      snapshot.accounts.slice(2).map((account) => account.classification),
    ).toEqual(["asset", "liability", "accounts_payable"]);
  });

  it("normalizes subtotal, discount, shipping, tax-inclusive totals, and rounding", () => {
    const snapshot = normalizeQboDataset(
      dataset({
        items: [
          {
            Id: "service",
            Name: "Advisory",
            IncomeAccountRef: { value: "income" },
          },
          {
            Id: "shipping",
            Name: "Shipping",
            IncomeAccountRef: { value: "income" },
          },
        ],
        invoices: [
          {
            Id: "exclusive",
            GlobalTaxCalculation: "TaxExcluded",
            TotalAmt: 115.51,
            TxnTaxDetail: { TotalTax: 10.5 },
            Line: [
              {
                Id: "service",
                DetailType: "SalesItemLineDetail",
                Amount: 100,
                SalesItemLineDetail: { ItemRef: { value: "service" } },
              },
              {
                Id: "subtotal",
                DetailType: "SubtotalLineDetail",
                Amount: 100,
                SubtotalLineDetail: {},
              },
              {
                Id: "shipping",
                DetailType: "SalesItemLineDetail",
                Amount: 10,
                SalesItemLineDetail: {
                  ItemRef: { value: "shipping", name: "Shipping" },
                },
              },
              {
                Id: "discount",
                DetailType: "DiscountLineDetail",
                Amount: 5,
                DiscountLineDetail: {
                  DiscountAccountRef: { value: "discount" },
                },
              },
            ],
          },
          {
            Id: "inclusive",
            GlobalTaxCalculation: "TaxInclusive",
            TotalAmt: 120,
            TxnTaxDetail: { TotalTax: 20 },
            Line: [
              {
                Id: "inclusive-line",
                DetailType: "SalesItemLineDetail",
                Amount: 120,
                SalesItemLineDetail: { TaxInclusiveAmt: 120 },
              },
            ],
          },
          {
            Id: "percentage-discount",
            GlobalTaxCalculation: "NotApplicable",
            TotalAmt: 90,
            Line: [
              {
                Id: "service",
                DetailType: "SalesItemLineDetail",
                Amount: 100,
                SalesItemLineDetail: { ItemRef: { value: "service" } },
              },
              {
                Id: "discount",
                DetailType: "DiscountLineDetail",
                DiscountLineDetail: {
                  PercentBased: true,
                  DiscountPercent: 10,
                  DiscountAccountRef: { value: "discount" },
                },
              },
            ],
          },
        ],
        bills: [
          {
            Id: "inclusive-bill",
            GlobalTaxCalculation: "TaxInclusive",
            TotalAmt: 60,
            TxnTaxDetail: { TotalTax: 10 },
            Line: [
              {
                Id: "inclusive-line",
                DetailType: "AccountBasedExpenseLineDetail",
                Amount: 60,
                AccountBasedExpenseLineDetail: {
                  AccountRef: { value: "expense" },
                  TaxInclusiveAmt: 60,
                },
              },
            ],
          },
        ],
      }),
    );

    const invoice = snapshot.invoices[0]!;
    expect(invoice.lines.map((line) => line.kind)).toEqual([
      "item",
      "shipping",
      "discount",
    ]);
    expect(invoice.lines[2]?.amount.amount).toBe(-5);
    expect(invoice.subtotal.amount).toBe(100);
    expect(invoice.normalization).toMatchObject({
      taxCalculation: "tax_exclusive",
      discount: { amount: 5, currency: "USD" },
      shipping: { amount: 10, currency: "USD" },
      calculatedTotal: { amount: 115.5, currency: "USD" },
      rounding: { amount: 0.01, currency: "USD" },
    });
    expect(snapshot.invoices[1]?.normalization.calculatedTotal.amount).toBe(
      120,
    );
    expect(snapshot.invoices[2]?.lines[1]).toMatchObject({
      kind: "discount",
      amount: { amount: -10, currency: "USD" },
    });
    expect(snapshot.invoices[2]?.normalization.calculatedTotal.amount).toBe(90);
    expect(snapshot.invoices[2]?.normalization.discount.amount).toBe(10);
    expect(snapshot.bills[0]?.normalization.calculatedTotal.amount).toBe(60);
  });

  it("normalizes transaction tax codes and their component rates", () => {
    const snapshot = normalizeQboDataset(
      dataset({
        taxRates: [
          { Id: "state", Name: "State", RateValue: 6, Active: true },
          { Id: "local", Name: "Local", RateValue: 2, Active: true },
        ],
        taxCodes: [
          {
            Id: "combined",
            Name: "COMBINED",
            Active: true,
            Taxable: true,
            SalesTaxRateList: {
              TaxRateDetail: [
                { TaxRateRef: { value: "state" } },
                { TaxRateRef: { value: "local" } },
              ],
            },
          },
        ],
        invoices: [
          {
            Id: "invoice",
            TotalAmt: 108,
            TxnTaxDetail: { TotalTax: 8 },
            Line: [
              {
                Id: "line",
                DetailType: "SalesItemLineDetail",
                Amount: 100,
                SalesItemLineDetail: { TaxCodeRef: { value: "combined" } },
              },
            ],
          },
        ],
      }),
    );

    expect(snapshot.taxCodes).toEqual([
      expect.objectContaining({
        id: "tax_code_combined",
        name: "COMBINED",
        salesRate: 8,
        componentRateIds: ["tax_rate_state", "tax_rate_local"],
      }),
    ]);
    expect(snapshot.invoices[0]?.lines[0]?.taxCodeId).toBe("tax_code_combined");
  });

  it("parses report leaf rows, column semantics, basis, and period", () => {
    const snapshot = normalizeQboDataset(
      dataset({
        reports: {
          trialBalance: {
            Header: {
              ReportName: "TrialBalance",
              ReportBasis: "Accrual",
              StartPeriod: "2026-01-01",
              EndPeriod: "2026-06-30",
              Currency: "USD",
            },
            Columns: {
              Column: [
                { ColTitle: "Account", ColType: "Account" },
                { ColTitle: "Debit", ColType: "Money" },
                { ColTitle: "Credit", ColType: "Money" },
              ],
            },
            Rows: {
              Row: [
                {
                  type: "Section",
                  Rows: {
                    Row: [
                      {
                        type: "Data",
                        ColData: [
                          { value: "Checking", id: "bank" },
                          { value: "100.00" },
                          { value: "" },
                        ],
                      },
                      {
                        type: "Data",
                        ColData: [
                          { value: "Payables", id: "ap" },
                          { value: "" },
                          { value: "100.00" },
                        ],
                      },
                    ],
                  },
                  Summary: {
                    ColData: [
                      { value: "TOTAL" },
                      { value: "100.00" },
                      { value: "100.00" },
                    ],
                  },
                },
              ],
            },
          },
          arAging: {
            Header: {
              ReportName: "AgedReceivables",
              ReportBasis: "Accrual",
              EndPeriod: "2026-06-30",
            },
            Columns: {
              Column: [
                { ColTitle: "Customer", ColType: "Customer" },
                { ColTitle: "Current", ColType: "Money" },
                { ColTitle: "Total", ColType: "Money" },
              ],
            },
            Rows: {
              Row: [
                {
                  type: "Data",
                  ColData: [
                    { value: "Customer A", id: "customer" },
                    { value: "50.00" },
                    { value: "50.00" },
                  ],
                },
                {
                  type: "Section",
                  Summary: {
                    ColData: [
                      { value: "TOTAL" },
                      { value: "50.00" },
                      { value: "50.00" },
                    ],
                  },
                },
              ],
            },
          },
        },
      }),
    );

    expect(snapshot.reports.trialBalance).toEqual([
      expect.objectContaining({
        label: "Checking",
        accountId: "acct_bank",
        amount: { amount: 100, currency: "USD" },
      }),
      expect.objectContaining({
        label: "Payables",
        accountId: "acct_ap",
        amount: { amount: -100, currency: "USD" },
      }),
    ]);
    expect(snapshot.reports.arAging).toHaveLength(1);
    expect(snapshot.reports.metadata?.trialBalance).toMatchObject({
      basis: "accrual",
      startDate: "2026-01-01",
      endDate: "2026-06-30",
    });
    expect(snapshot.balances.map((balance) => balance.asOfDate)).toEqual([
      "2026-06-30",
      "2026-06-30",
    ]);
  });
});
