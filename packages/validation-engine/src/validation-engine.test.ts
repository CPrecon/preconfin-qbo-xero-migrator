import { describe, expect, it } from "vitest";
import type { AccountingSnapshot } from "@preconfin/canonical-model";
import { createMigrationPlan } from "@preconfin/migration-engine";
import { validateMigration } from "./index.js";

function snapshot(): AccountingSnapshot {
  return {
    organization: { id: "org_1", legalName: "Test", displayName: "Test", baseCurrency: "USD", source: { sourceSystem: "quickbooks-online", sourceId: "1", sourceType: "company", metadata: {} } },
    accounts: [{ id: "acct_1", name: "Checking", classification: "bank", active: true, source: { sourceSystem: "quickbooks-online", sourceId: "1", sourceType: "account", metadata: {} } }],
    contacts: [], items: [], invoices: [], bills: [], payments: [], credits: [], journals: [{ id: "journal_1", source: { sourceSystem: "quickbooks-online", sourceId: "1", sourceType: "journal", metadata: {} }, lines: [
      { id: "1", amount: { amount: 100, currency: "USD" }, side: "debit" },
      { id: "2", amount: { amount: 50, currency: "USD" }, side: "credit" }
    ] }], taxRates: [], currencies: [{ id: "currency_USD", source: { sourceSystem: "quickbooks-online", sourceId: "USD", sourceType: "currency", metadata: {} }, code: "USD", active: true }], tracking: [], balances: [],
    reports: { trialBalance: [{ label: "Checking", amount: { amount: 0, currency: "USD" }, accountId: "acct_1" }], profitAndLoss: [], balanceSheet: [] },
    pulledAt: new Date().toISOString()
  };
}

describe("validateMigration", () => {
  it("blocks unbalanced journals", () => {
    const data = snapshot();
    const report = validateMigration(data, createMigrationPlan(data));
    expect(report.summary.readiness).toBe("blocked");
    expect(report.findings.some((finding) => finding.code === "UNBALANCED_JOURNAL")).toBe(true);
  });
});
