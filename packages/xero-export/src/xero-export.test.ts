import { describe, expect, it } from "vitest";
import { createMigrationPlan } from "@preconfin/migration-engine";
import { validateMigration } from "@preconfin/validation-engine";
import { createExportFiles, createMigrationPackage, toCsv } from "./index.js";
import { accountingFixture } from "./accounting-fixture.test-helper.js";

describe("toCsv", () => {
  it("escapes quoted cells", () => {
    expect(toCsv([{ Name: 'A "quoted" name' }], ["Name"])).toContain(
      '"A ""quoted"" name"',
    );
  });
});

describe("createExportFiles", () => {
  it("generates schema-stable Xero CSV files with mapped values", async () => {
    const snapshot = accountingFixture();
    const plan = createMigrationPlan(snapshot);
    const report = validateMigration(snapshot, plan);
    const files = createExportFiles(snapshot, plan, report);
    const byPath = new Map(
      files.map((file) => [file.path, String(file.content)]),
    );

    expect([...byPath.keys()]).toEqual(
      expect.arrayContaining([
        "import-ready/chart-of-accounts.csv",
        "import-ready/contacts.csv",
        "import-ready/items.csv",
        "import-ready/sales-invoices.csv",
        "import-ready/bills.csv",
        "import-ready/credit-notes.csv",
        "manual-configuration/manual-journals.csv",
        "manual-configuration/bank-statements.csv",
        "manual-configuration/opening-balances.csv",
        "reference-only/mapping-report.csv",
        "reference-only/exceptions.csv",
        "unsupported/unsupported-records.csv",
        "excluded/excluded-records.csv",
        "reference-only/validation-report.json",
        "README.md",
      ]),
    );

    expect(byPath.get("import-ready/sales-invoices.csv")?.split("\n")[0]).toBe(
      "InvoiceNumber,ContactName,InvoiceDate,DueDate,Description,Quantity,UnitAmount,AccountCode,TaxType,Currency,Status",
    );
    expect(byPath.get("import-ready/bills.csv")?.split("\n")[0]).toBe(
      "BillNumber,ContactName,BillDate,DueDate,Description,Quantity,UnitAmount,AccountCode,TaxType,Currency,Status",
    );
    expect(byPath.get("import-ready/credit-notes.csv")?.split("\n")[0]).toBe(
      "CreditNoteNumber,ContactName,Date,Description,Quantity,UnitAmount,AccountCode,TaxType,Currency,Status,Type",
    );
    expect(
      byPath.get("manual-configuration/manual-journals.csv")?.split("\n")[0],
    ).toBe("Narration,Date,AccountCode,Description,Debit,Credit,TaxType");
    expect(byPath.get("import-ready/sales-invoices.csv")).toContain(
      "Acme Corp",
    );
    expect(byPath.get("import-ready/sales-invoices.csv")).toContain("400");
    expect(byPath.get("import-ready/sales-invoices.csv")).not.toContain(
      "acct_rev",
    );

    const pkg = await createMigrationPackage(snapshot, plan, report);
    expect(pkg.zip.length).toBeGreaterThan(1000);
  });
});
