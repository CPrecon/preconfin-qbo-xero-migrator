import { describe, expect, it } from "vitest";
import type { Account, AccountingSnapshot } from "@preconfin/canonical-model";
import { createMigrationPlan, mapAccounts } from "./index.js";

function source(
  sourceId: string,
  sourceType: "account" | "customer" = "account",
) {
  return {
    sourceSystem: "quickbooks-online" as const,
    sourceId,
    sourceType,
    metadata: {},
  };
}

function snapshot(accounts: Account[]): AccountingSnapshot {
  return {
    organization: {
      id: "org",
      legalName: "Test",
      displayName: "Test",
      baseCurrency: "USD",
      source: {
        sourceSystem: "quickbooks-online",
        sourceId: "org",
        sourceType: "company",
        metadata: {},
      },
    },
    accounts,
    contacts: [],
    items: [],
    invoices: [],
    bills: [],
    payments: [],
    credits: [],
    journals: [],
    taxRates: [],
    currencies: [],
    tracking: [],
    balances: [],
    reports: {
      trialBalance: [],
      profitAndLoss: [],
      balanceSheet: [],
      arAging: [],
      apAging: [],
    },
    pulledAt: "2026-06-30T00:00:00.000Z",
  };
}

describe("QBO account mappings", () => {
  it("maps standard account types and subtypes without unsupported errors", () => {
    const cases = [
      ["Bank", "Checking", "bank", "BANK"],
      ["CreditCard", "CreditCard", "liability", "BANK"],
      [
        "AccountsReceivable",
        "AccountsReceivable",
        "accounts_receivable",
        "CURRENT",
      ],
      ["AccountsPayable", "AccountsPayable", "accounts_payable", "CURRLIAB"],
      ["OtherCurrentAsset", "UndepositedFunds", "asset", "CURRENT"],
      ["OtherCurrentAsset", "PrepaidExpenses", "asset", "PREPAYMENT"],
      ["OtherCurrentAsset", "Inventory", "asset", "INVENTORY"],
      ["FixedAsset", "Buildings", "asset", "FIXED"],
      ["FixedAsset", "AccumulatedDepreciation", "asset", "FIXED"],
      ["OtherAsset", "OtherLongTermAssets", "asset", "NONCURRENT"],
      ["LongTermLiability", "LoanPayable", "liability", "TERMLIAB"],
      ["CostOfGoodsSold", "SuppliesMaterialsCogs", "expense", "DIRECTCOSTS"],
      ["Expense", "Depreciation", "expense", "DEPRECIATN"],
      ["OtherExpense", "OtherMiscellaneousExpense", "expense", "EXPENSE"],
      ["OtherIncome", "OtherMiscellaneousIncome", "revenue", "OTHERINCOME"],
      ["OtherCurrentLiability", "SalesTaxPayable", "liability", "CURRLIAB"],
      [
        "OtherCurrentLiability",
        "OtherCurrentLiabilities",
        "liability",
        "CURRLIAB",
      ],
    ] as const;
    const accounts = cases.map(
      ([sourceAccountType, sourceAccountSubType, classification], index) => ({
        id: `acct_${index}`,
        name: sourceAccountSubType,
        classification,
        sourceAccountType,
        sourceAccountSubType,
        active: true,
        code: String(100 + index),
        source: source(String(index)),
      }),
    );

    const result = mapAccounts(snapshot(accounts));
    const targetTypeBySourceId = new Map(
      result.mappings.map((mapping) => [mapping.sourceId, mapping.targetType]),
    );
    expect(
      cases.map((entry, index) => targetTypeBySourceId.get(`acct_${index}`)),
    ).toEqual(cases.map((entry) => entry[3]));
    expect(result.exceptions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNSUPPORTED_ACCOUNT_TYPE" }),
      ]),
    );
  });

  it("continues to flag genuinely unknown account types", () => {
    const result = mapAccounts(
      snapshot([
        {
          id: "acct_unknown",
          name: "Unknown",
          classification: "other",
          sourceAccountType: "UnknownType",
          active: true,
          currentBalance: { amount: 1, currency: "USD" },
          source: source("unknown"),
        },
      ]),
    );
    expect(result.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNSUPPORTED_ACCOUNT_TYPE" }),
      ]),
    );
  });

  it("does not duplicate source-data findings in the migration plan", () => {
    const data = snapshot([]);
    data.contacts = [
      {
        id: "contact_1",
        name: "Same Name",
        type: "customer",
        active: true,
        source: source("1", "customer"),
      },
      {
        id: "contact_2",
        name: "Same Name",
        type: "customer",
        active: true,
        source: source("2", "customer"),
      },
    ];

    expect(
      createMigrationPlan(data).exceptions.some(
        (exception) => exception.code === "DUPLICATE_CONTACT",
      ),
    ).toBe(false);
  });
});
