import { describe, expect, it } from "vitest";
import type { AccountingSnapshot } from "@preconfin/canonical-model";
import { createMigrationPlan } from "./index.js";

const baseSnapshot: AccountingSnapshot = {
  organization: {
    id: "org_1",
    legalName: "Test",
    displayName: "Test",
    baseCurrency: "USD",
    source: {
      sourceSystem: "quickbooks-online",
      sourceId: "1",
      sourceType: "company",
      metadata: {},
    },
  },
  accounts: [
    {
      id: "acct_1",
      name: "Checking",
      classification: "bank",
      active: true,
      code: "100",
      source: {
        sourceSystem: "quickbooks-online",
        sourceId: "1",
        sourceType: "account",
        metadata: {},
      },
    },
    {
      id: "acct_2",
      name: "Mystery",
      classification: "other",
      active: true,
      source: {
        sourceSystem: "quickbooks-online",
        sourceId: "2",
        sourceType: "account",
        metadata: {},
      },
    },
  ],
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
  pulledAt: new Date().toISOString(),
};

describe("createMigrationPlan", () => {
  it("maps accounts and flags unsupported account types", () => {
    const plan = createMigrationPlan(baseSnapshot);
    expect(plan.accountMappings[0]?.targetType).toBe("BANK");
    expect(
      plan.exceptions.some(
        (exception) => exception.code === "UNSUPPORTED_ACCOUNT_TYPE",
      ),
    ).toBe(true);
  });
});
