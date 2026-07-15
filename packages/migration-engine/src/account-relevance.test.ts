import { describe, expect, it } from "vitest";
import type {
  Account,
  AccountingSnapshot,
  SourceReference,
  SourceType,
} from "@preconfin/canonical-model";
import { assessAccountRelevance, createMigrationPlan } from "./index.js";

function source(sourceType: SourceType, sourceId: string): SourceReference {
  return {
    sourceSystem: "quickbooks-online",
    sourceId,
    sourceType,
    metadata: {},
  };
}

function account(
  id: string,
  input: Partial<Account> & Pick<Account, "classification">,
): Account {
  return {
    id,
    name: input.name ?? id,
    classification: input.classification,
    sourceAccountType: input.sourceAccountType ?? "Expense",
    sourceAccountSubType: input.sourceAccountSubType,
    active: input.active ?? true,
    code: input.code ?? id.replace("acct_", ""),
    currentBalance: input.currentBalance,
    source: source("account", id),
  };
}

function snapshot(accounts: Account[]): AccountingSnapshot {
  return {
    organization: {
      id: "org_relevance",
      legalName: "Relevance Test",
      displayName: "Relevance Test",
      baseCurrency: "USD",
      source: source("company", "company_1"),
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
    taxCodes: [],
    currencies: [],
    tracking: [],
    balances: [],
    reports: {
      trialBalance: [],
      profitAndLoss: [],
      balanceSheet: [],
      arAging: [],
      apAging: [],
      metadata: {
        trialBalance: {
          name: "Trial Balance",
          basis: "accrual",
          startDate: "2026-01-01",
          endDate: "2026-06-30",
          generatedAt: "2026-06-30T12:00:00.000Z",
          currency: "USD",
          noData: false,
        },
      },
    },
    pulledAt: "2026-06-30T12:00:00.000Z",
  };
}

function disposition(data: AccountingSnapshot, accountId: string) {
  return createMigrationPlan(data).accountScope?.find(
    (scope) => scope.sourceId === accountId,
  );
}

describe("account migration relevance", () => {
  it("excludes a zero-balance inactive unused account without a decision", () => {
    const data = snapshot([
      account("acct_unused", {
        classification: "expense",
        active: false,
      }),
    ]);

    expect(disposition(data, "acct_unused")?.disposition).toBe(
      "excluded_unused_account",
    );
    expect(createMigrationPlan(data).accountScopeSummary).toMatchObject({
      decisionRequiredAccounts: 0,
      excludedUnusedAccounts: 1,
    });
  });

  it("excludes a zero-balance active unused account without a decision", () => {
    const data = snapshot([
      account("acct_unused", {
        classification: "bank",
        sourceAccountType: "Bank",
      }),
    ]);

    expect(disposition(data, "acct_unused")?.disposition).toBe(
      "excluded_unused_account",
    );
  });

  it("keeps a zero-balance account referenced by an item relevant", () => {
    const data = snapshot([
      account("acct_revenue", {
        classification: "revenue",
        sourceAccountType: "Income",
      }),
    ]);
    data.items.push({
      id: "item_1",
      name: "Service",
      active: true,
      incomeAccountId: "acct_revenue",
      isInventory: false,
      source: source("item", "item_1"),
    });

    const scope = disposition(data, "acct_revenue");
    expect(scope?.disposition).toBe("auto_mapped");
    expect(scope?.relevanceReasons).toContain("item_dependency");
  });

  it("keeps a historical exported transaction account relevant", () => {
    const data = snapshot([
      account("acct_revenue", {
        classification: "revenue",
        sourceAccountType: "Income",
      }),
    ]);
    data.invoices.push({
      id: "invoice_historical",
      number: "INV-HISTORICAL",
      issueDate: "2025-12-15",
      status: "paid",
      lines: [
        {
          id: "line_1",
          kind: "account",
          accountId: "acct_revenue",
          amount: { amount: 100, currency: "USD" },
        },
      ],
      subtotal: { amount: 100, currency: "USD" },
      tax: { amount: 0, currency: "USD" },
      total: { amount: 100, currency: "USD" },
      amountDue: { amount: 0, currency: "USD" },
      source: source("invoice", "invoice_historical"),
    });

    const scope = disposition(data, "acct_revenue");
    expect(scope?.disposition).toBe("auto_mapped");
    expect(scope?.relevanceReasons).toContain("exported_record_dependency");
    expect(scope?.relevanceReasons).not.toContain("period_activity");
  });

  it("maps an account with a non-zero balance", () => {
    const data = snapshot([
      account("acct_expense", {
        classification: "expense",
        currentBalance: { amount: 25, currency: "USD" },
      }),
    ]);

    const plan = createMigrationPlan(data);
    expect(plan.accountMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "acct_expense",
          targetType: "EXPENSE",
        }),
      ]),
    );
    expect(disposition(data, "acct_expense")?.disposition).toBe("auto_mapped");
  });

  it("does not create a user decision for a deterministic standard mapping", () => {
    const expense = account("acct_expense", {
      classification: "expense",
      currentBalance: { amount: 25, currency: "USD" },
    });
    delete expense.code;
    const data = snapshot([expense]);

    expect(createMigrationPlan(data).accountScopeSummary).toMatchObject({
      autoMappedAccounts: 1,
      decisionRequiredAccounts: 0,
    });
    expect(createMigrationPlan(data).accountMappings[0]?.notes).toContain(
      "Generated Xero account code because QuickBooks account number was empty.",
    );
  });

  it("creates exactly one decision for an ambiguous credit-card account", () => {
    const data = snapshot([
      account("acct_card", {
        classification: "liability",
        sourceAccountType: "Credit Card",
        sourceAccountSubType: "CreditCard",
        currentBalance: { amount: -50, currency: "USD" },
      }),
    ]);

    const plan = createMigrationPlan(data);
    expect(plan.accountScopeSummary?.decisionRequiredAccounts).toBe(1);
    expect(disposition(data, "acct_card")).toMatchObject({
      disposition: "decision_required",
      decisionReason: "Confirm the destination Xero credit-card bank account.",
    });
  });

  it("reconciles every account-scope summary dimension", () => {
    const data = snapshot([
      account("acct_unused", { classification: "expense" }),
      account("acct_expense", {
        classification: "expense",
        currentBalance: { amount: 25, currency: "USD" },
      }),
      account("acct_card", {
        classification: "liability",
        sourceAccountType: "Credit Card",
        currentBalance: { amount: -50, currency: "USD" },
      }),
    ]);

    const summary = createMigrationPlan(data).accountScopeSummary!;
    expect(summary.totalAccounts).toBe(
      summary.relevantAccounts + summary.excludedUnusedAccounts,
    );
    expect(summary.relevantAccounts).toBe(
      summary.autoMappedAccounts + summary.decisionRequiredAccounts,
    );
    expect(summary).toEqual({
      totalAccounts: 3,
      relevantAccounts: 2,
      autoMappedAccounts: 1,
      decisionRequiredAccounts: 1,
      excludedUnusedAccounts: 1,
    });
  });

  it("is independent of account input ordering", () => {
    const accounts = [
      account("acct_unused", { classification: "expense" }),
      account("acct_expense", {
        classification: "expense",
        currentBalance: { amount: 25, currency: "USD" },
      }),
      account("acct_card", {
        classification: "liability",
        sourceAccountType: "Credit Card",
        currentBalance: { amount: -50, currency: "USD" },
      }),
    ];

    expect(assessAccountRelevance(snapshot(accounts))).toEqual(
      assessAccountRelevance(snapshot([...accounts].reverse())),
    );
    expect(createMigrationPlan(snapshot(accounts)).accountScope).toEqual(
      createMigrationPlan(snapshot([...accounts].reverse())).accountScope,
    );
  });
});
