import { describe, expect, it } from "vitest";
import type { AccountingSnapshot, Invoice } from "@preconfin/canonical-model";
import { createMigrationPlan } from "@preconfin/migration-engine";
import { validateMigration } from "./index.js";

function source(
  sourceId: string,
  sourceType: "account" | "customer" | "invoice" | "tax-code",
) {
  return {
    sourceSystem: "quickbooks-online" as const,
    sourceId,
    sourceType,
    metadata: {},
  };
}

function baseSnapshot(): AccountingSnapshot {
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
    accounts: [
      {
        id: "acct_income",
        code: "400",
        name: "Sales",
        classification: "revenue",
        active: true,
        source: source("income", "account"),
      },
    ],
    contacts: [
      {
        id: "contact_customer",
        name: "Customer",
        type: "customer",
        active: true,
        source: source("customer", "customer"),
      },
    ],
    items: [],
    invoices: [],
    bills: [],
    payments: [],
    credits: [],
    journals: [],
    taxRates: [],
    currencies: [
      {
        id: "currency_USD",
        code: "USD",
        active: true,
        source: {
          sourceSystem: "quickbooks-online",
          sourceId: "USD",
          sourceType: "currency",
          metadata: {},
        },
      },
    ],
    tracking: [],
    balances: [],
    reports: {
      trialBalance: [
        {
          label: "Sales",
          accountId: "acct_income",
          amount: { amount: 0, currency: "USD" },
        },
      ],
      profitAndLoss: [],
      balanceSheet: [],
      arAging: [],
      apAging: [],
    },
    pulledAt: "2026-06-30T00:00:00.000Z",
  };
}

function inclusiveInvoice(): Invoice {
  return {
    id: "invoice",
    number: "INV-1",
    contactId: "contact_customer",
    status: "authorized",
    lines: [
      {
        id: "line",
        kind: "item",
        accountId: "acct_income",
        amount: { amount: 120, currency: "USD" },
        taxInclusiveAmount: { amount: 120, currency: "USD" },
      },
    ],
    subtotal: { amount: 100, currency: "USD" },
    tax: { amount: 20, currency: "USD" },
    total: { amount: 120, currency: "USD" },
    amountDue: { amount: 0, currency: "USD" },
    normalization: {
      taxCalculation: "tax_inclusive",
      discount: { amount: 0, currency: "USD" },
      shipping: { amount: 0, currency: "USD" },
      calculatedTotal: { amount: 120, currency: "USD" },
      rounding: { amount: 0, currency: "USD" },
    },
    source: source("invoice", "invoice"),
  };
}

describe("deterministic correctness validation", () => {
  it("accepts equivalent tax-inclusive normalized invoice totals", () => {
    const data = baseSnapshot();
    data.invoices = [inclusiveInvoice()];
    const report = validateMigration(data, createMigrationPlan(data));
    expect(
      report.findings.some(
        (finding) => finding.code === "INVOICE_TOTAL_MISMATCH",
      ),
    ).toBe(false);
  });

  it("emits one finding for one duplicated contact group", () => {
    const data = baseSnapshot();
    data.contacts.push({
      id: "contact_duplicate",
      name: "Customer",
      type: "customer",
      active: true,
      source: source("duplicate", "customer"),
    });
    const report = validateMigration(data, createMigrationPlan(data));
    expect(
      report.findings.filter((finding) => finding.code === "DUPLICATE_CONTACT"),
    ).toHaveLength(1);
  });

  it("deduplicates repeated line-reference findings for one document", () => {
    const data = baseSnapshot();
    const invoice = inclusiveInvoice();
    invoice.lines = [
      {
        id: "line_1",
        kind: "item",
        amount: { amount: 50, currency: "USD" },
      },
      {
        id: "line_2",
        kind: "item",
        amount: { amount: 50, currency: "USD" },
      },
    ];
    invoice.subtotal = { amount: 100, currency: "USD" };
    invoice.tax = { amount: 0, currency: "USD" };
    invoice.total = { amount: 100, currency: "USD" };
    invoice.normalization = {
      taxCalculation: "not_applicable",
      discount: { amount: 0, currency: "USD" },
      shipping: { amount: 0, currency: "USD" },
      calculatedTotal: { amount: 100, currency: "USD" },
      rounding: { amount: 0, currency: "USD" },
    };
    data.invoices = [invoice];

    const report = validateMigration(data, createMigrationPlan(data));
    expect(
      report.findings.filter(
        (finding) => finding.code === "MISSING_ACCOUNT_REFERENCE",
      ),
    ).toHaveLength(1);
  });

  it("validates transaction tax-code references against normalized tax codes", () => {
    const data = baseSnapshot();
    const invoice = inclusiveInvoice();
    invoice.lines[0]!.taxCodeId = "tax_code_standard";
    data.invoices = [invoice];
    data.taxCodes = [
      {
        id: "tax_code_standard",
        name: "STANDARD",
        active: true,
        taxable: true,
        salesRate: 20,
        purchaseRate: 20,
        componentRateIds: ["tax_rate_standard"],
        source: source("standard", "tax-code"),
      },
    ];

    const report = validateMigration(data, createMigrationPlan(data));
    expect(
      report.findings.some(
        (finding) =>
          finding.code === "INVALID_TAX_REFERENCE" ||
          finding.code === "MISSING_TAX_MAPPING",
      ),
    ).toBe(false);
  });
});
