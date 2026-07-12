import { describe, expect, it } from "vitest";
import { normalizeQboDataset } from "./qbo-normalizer.js";

describe("normalizeQboDataset", () => {
  it("creates a canonical snapshot with organization, accounts, and invoices", () => {
    const snapshot = normalizeQboDataset({
      realmId: "123",
      companyInfo: { CompanyName: "Harbor Logistics", Country: "US" },
      accounts: [{ Id: "1", Name: "Checking", AccountType: "Bank", CurrentBalance: 1200, Active: true }],
      customers: [{ Id: "10", DisplayName: "Acme Co", Active: true }],
      vendors: [],
      items: [],
      invoices: [{ Id: "20", DocNumber: "INV-20", CustomerRef: { value: "10" }, TotalAmt: 100, Balance: 100, Line: [{ Id: "1", DetailType: "SalesItemLineDetail", Amount: 100 }] }],
      bills: [],
      payments: [],
      creditMemos: [],
      vendorCredits: [],
      journalEntries: [],
      taxRates: [],
      classes: [],
      departments: [],
      currencies: [],
      reports: {}
    });

    expect(snapshot.organization.displayName).toBe("Harbor Logistics");
    expect(snapshot.accounts[0]?.classification).toBe("bank");
    expect(snapshot.invoices[0]?.total.amount).toBe(100);
  });
});
