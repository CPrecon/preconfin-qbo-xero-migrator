import archiver from "archiver";
import { PassThrough } from "node:stream";
import type {
  AccountingSnapshot,
  Bill,
  Credit,
  Invoice,
} from "@preconfin/canonical-model";
import type { MappingResult, MigrationPlan } from "@preconfin/migration-engine";
import type { ValidationReport } from "@preconfin/validation-engine";
import { toCsv, type CsvRow } from "./csv.js";

export interface ExportFile {
  path: string;
  content: string | Buffer;
  contentType: string;
}

export interface MigrationPackage {
  files: ExportFile[];
  zip: Buffer;
}

interface ExportContext {
  accountCodeById: Map<string, string>;
  taxCodeById: Map<string, string>;
  contactNameById: Map<string, string>;
}

function formatDate(value?: string): string {
  return value ?? "";
}

function amount(value: { amount: number }): string {
  return value.amount.toFixed(2);
}

function targetById(
  mappings: MappingResult[],
  fallbackField: "targetCode" | "targetName",
): Map<string, string> {
  return new Map(
    mappings.map((mapping) => [
      mapping.sourceId,
      String(mapping[fallbackField] ?? mapping.targetName),
    ]),
  );
}

function createContext(
  snapshot: AccountingSnapshot,
  plan: MigrationPlan,
): ExportContext {
  return {
    accountCodeById: targetById(plan.accountMappings, "targetCode"),
    taxCodeById: targetById(plan.taxMappings, "targetCode"),
    contactNameById: new Map(
      snapshot.contacts.map((contact) => [contact.id, contact.name]),
    ),
  };
}

function accountCode(ctx: ExportContext, sourceId?: string): string {
  if (!sourceId) return "";
  return ctx.accountCodeById.get(sourceId) ?? sourceId;
}

function taxCode(ctx: ExportContext, sourceId?: string): string {
  if (!sourceId) return "NONE";
  return ctx.taxCodeById.get(sourceId) ?? "NONE";
}

function contactName(ctx: ExportContext, sourceId?: string): string {
  if (!sourceId) return "";
  return ctx.contactNameById.get(sourceId) ?? sourceId;
}

function accountsCsv(
  snapshot: AccountingSnapshot,
  plan: MigrationPlan,
): ExportFile {
  const accountById = new Map(
    snapshot.accounts.map((account) => [account.id, account]),
  );
  const rows = plan.accountMappings.map((mapping) => {
    const account = accountById.get(mapping.sourceId);
    return {
      Code: mapping.targetCode,
      Name: mapping.targetName,
      Type: mapping.targetType,
      TaxType: "NONE",
      Description:
        account?.fullyQualifiedName ?? account?.name ?? mapping.sourceName,
      Dashboard: account?.classification === "bank" ? "Yes" : "No",
      ExpenseClaims: account?.classification === "expense" ? "Yes" : "No",
      EnablePayments: account?.classification === "bank" ? "Yes" : "No",
    };
  });
  return {
    path: "import-ready/chart-of-accounts.csv",
    content: toCsv(rows, [
      "Code",
      "Name",
      "Type",
      "TaxType",
      "Description",
      "Dashboard",
      "ExpenseClaims",
      "EnablePayments",
    ]),
    contentType: "text/csv",
  };
}

function contactsCsv(snapshot: AccountingSnapshot): ExportFile {
  const rows = snapshot.contacts.map((contact) => ({
    ContactName: contact.name,
    AccountNumber: contact.source.sourceId,
    EmailAddress: contact.email,
    FirstName: "",
    LastName: "",
    PhoneNumber: contact.phone,
    PostalAddressLine1: contact.billingAddress,
    TaxNumber: contact.taxNumber,
    ContactType: contact.type,
  }));
  return {
    path: "import-ready/contacts.csv",
    content: toCsv(rows, [
      "ContactName",
      "AccountNumber",
      "EmailAddress",
      "FirstName",
      "LastName",
      "PhoneNumber",
      "PostalAddressLine1",
      "TaxNumber",
      "ContactType",
    ]),
    contentType: "text/csv",
  };
}

function invoiceRows(invoices: Invoice[], ctx: ExportContext): CsvRow[] {
  return invoices.flatMap((invoice) =>
    invoice.lines.map((line) => ({
      InvoiceNumber: invoice.number,
      ContactName: contactName(ctx, line.contactId ?? invoice.contactId),
      InvoiceDate: formatDate(invoice.issueDate),
      DueDate: formatDate(invoice.dueDate),
      Description: line.description,
      Quantity: line.quantity ?? 1,
      UnitAmount: line.unitAmount
        ? amount(line.unitAmount)
        : amount(line.amount),
      AccountCode: accountCode(ctx, line.accountId),
      TaxType: taxCode(ctx, line.taxRateId),
      Currency: invoice.total.currency,
      Status: invoice.status === "paid" ? "Paid" : "Approved",
    })),
  );
}

function billRows(bills: Bill[], ctx: ExportContext): CsvRow[] {
  return bills.flatMap((bill) =>
    bill.lines.map((line) => ({
      BillNumber: bill.number,
      ContactName: contactName(ctx, line.contactId ?? bill.contactId),
      BillDate: formatDate(bill.issueDate),
      DueDate: formatDate(bill.dueDate),
      Description: line.description,
      Quantity: line.quantity ?? 1,
      UnitAmount: line.unitAmount
        ? amount(line.unitAmount)
        : amount(line.amount),
      AccountCode: accountCode(ctx, line.accountId),
      TaxType: taxCode(ctx, line.taxRateId),
      Currency: bill.total.currency,
      Status: bill.status === "paid" ? "Paid" : "Approved",
    })),
  );
}

function creditRows(credits: Credit[], ctx: ExportContext): CsvRow[] {
  return credits.flatMap((credit) =>
    credit.lines.map((line) => ({
      CreditNoteNumber: credit.number ?? credit.id,
      ContactName: contactName(ctx, line.contactId ?? credit.contactId),
      Date: formatDate(credit.date),
      Description: line.description,
      Quantity: line.quantity ?? 1,
      UnitAmount: line.unitAmount
        ? amount(line.unitAmount)
        : amount(line.amount),
      AccountCode: accountCode(ctx, line.accountId),
      TaxType: taxCode(ctx, line.taxRateId),
      Currency: credit.total.currency,
      Status: "Approved",
      Type:
        credit.type === "supplier-credit" ? "SupplierCredit" : "CustomerCredit",
    })),
  );
}

function invoicesCsv(
  snapshot: AccountingSnapshot,
  ctx: ExportContext,
): ExportFile {
  return {
    path: "import-ready/sales-invoices.csv",
    content: toCsv(invoiceRows(snapshot.invoices, ctx), [
      "InvoiceNumber",
      "ContactName",
      "InvoiceDate",
      "DueDate",
      "Description",
      "Quantity",
      "UnitAmount",
      "AccountCode",
      "TaxType",
      "Currency",
      "Status",
    ]),
    contentType: "text/csv",
  };
}

function billsCsv(
  snapshot: AccountingSnapshot,
  ctx: ExportContext,
): ExportFile {
  return {
    path: "import-ready/bills.csv",
    content: toCsv(billRows(snapshot.bills, ctx), [
      "BillNumber",
      "ContactName",
      "BillDate",
      "DueDate",
      "Description",
      "Quantity",
      "UnitAmount",
      "AccountCode",
      "TaxType",
      "Currency",
      "Status",
    ]),
    contentType: "text/csv",
  };
}

function creditsCsv(
  snapshot: AccountingSnapshot,
  ctx: ExportContext,
): ExportFile {
  return {
    path: "import-ready/credit-notes.csv",
    content: toCsv(creditRows(snapshot.credits, ctx), [
      "CreditNoteNumber",
      "ContactName",
      "Date",
      "Description",
      "Quantity",
      "UnitAmount",
      "AccountCode",
      "TaxType",
      "Currency",
      "Status",
      "Type",
    ]),
    contentType: "text/csv",
  };
}

function itemsCsv(
  snapshot: AccountingSnapshot,
  ctx: ExportContext,
): ExportFile {
  const rows = snapshot.items.map((item) => ({
    ItemCode: item.sku ?? item.source.sourceId,
    ItemName: item.name,
    Description: item.description,
    PurchaseDescription: item.description,
    PurchaseUnitPrice: item.purchasePrice ? amount(item.purchasePrice) : "",
    SalesDescription: item.description,
    SalesUnitPrice: item.unitPrice ? amount(item.unitPrice) : "",
    SalesAccount: accountCode(ctx, item.incomeAccountId),
    PurchaseAccount: accountCode(ctx, item.expenseAccountId),
    InventoryAssetAccount: accountCode(ctx, item.inventoryAssetAccountId),
  }));
  return {
    path: "import-ready/items.csv",
    content: toCsv(rows, [
      "ItemCode",
      "ItemName",
      "Description",
      "PurchaseDescription",
      "PurchaseUnitPrice",
      "SalesDescription",
      "SalesUnitPrice",
      "SalesAccount",
      "PurchaseAccount",
      "InventoryAssetAccount",
    ]),
    contentType: "text/csv",
  };
}

function journalsCsv(
  snapshot: AccountingSnapshot,
  ctx: ExportContext,
): ExportFile {
  const rows = snapshot.journals.flatMap((journal) =>
    journal.lines.map((line) => ({
      Narration: journal.narration ?? journal.number ?? journal.id,
      Date: formatDate(journal.date),
      AccountCode: accountCode(ctx, line.accountId),
      Description: line.description,
      Debit: line.side === "debit" ? amount(line.amount) : "",
      Credit: line.side === "credit" ? amount(line.amount) : "",
      TaxType: taxCode(ctx, line.taxRateId),
    })),
  );
  return {
    path: "manual-configuration/manual-journals.csv",
    content: toCsv(rows, [
      "Narration",
      "Date",
      "AccountCode",
      "Description",
      "Debit",
      "Credit",
      "TaxType",
    ]),
    contentType: "text/csv",
  };
}

function bankStatementsCsv(
  snapshot: AccountingSnapshot,
  ctx: ExportContext,
): ExportFile {
  const rows = snapshot.payments.map((payment) => ({
    Date: formatDate(payment.date),
    Amount: amount(payment.amount),
    Payee: contactName(ctx, payment.contactId),
    Description: payment.number ?? payment.id,
    Reference: payment.source.sourceId,
    AccountCode: accountCode(ctx, payment.accountId),
  }));
  return {
    path: "manual-configuration/bank-statements.csv",
    content: toCsv(rows, [
      "Date",
      "Amount",
      "Payee",
      "Description",
      "Reference",
      "AccountCode",
    ]),
    contentType: "text/csv",
  };
}

function openingBalancesCsv(
  snapshot: AccountingSnapshot,
  ctx: ExportContext,
): ExportFile {
  const rows = snapshot.balances.map((balance) => ({
    AccountCode: accountCode(ctx, balance.accountId),
    Date: balance.asOfDate,
    Amount: amount(balance.amount),
    Currency: balance.amount.currency,
    Basis: balance.basis,
  }));
  return {
    path: "manual-configuration/opening-balances.csv",
    content: toCsv(rows, [
      "AccountCode",
      "Date",
      "Amount",
      "Currency",
      "Basis",
    ]),
    contentType: "text/csv",
  };
}

function mappingReportCsv(plan: MigrationPlan): ExportFile {
  const rows = [
    ...plan.accountMappings.map((mapping) => mappingRow("Account", mapping)),
    ...plan.taxMappings.map((mapping) => mappingRow("TaxRate", mapping)),
    ...plan.contactMappings.map((mapping) => mappingRow("Contact", mapping)),
    ...plan.itemMappings.map((mapping) => mappingRow("Item", mapping)),
    ...plan.trackingMappings.map((mapping) => mappingRow("Tracking", mapping)),
  ];
  return {
    path: "reference-only/mapping-report.csv",
    content: toCsv(rows, [
      "Entity",
      "SourceId",
      "SourceName",
      "TargetType",
      "TargetCode",
      "TargetName",
      "Confidence",
      "Notes",
    ]),
    contentType: "text/csv",
  };
}

function mappingRow(entity: string, mapping: MappingResult): CsvRow {
  return {
    Entity: entity,
    SourceId: mapping.sourceId,
    SourceName: mapping.sourceName,
    TargetType: mapping.targetType,
    TargetCode: mapping.targetCode,
    TargetName: mapping.targetName,
    Confidence: mapping.confidence,
    Notes: mapping.notes.join("; "),
  };
}

function exceptionsCsv(
  report: ValidationReport,
  plan: MigrationPlan,
): ExportFile {
  const rows = [
    ...report.findings.map((finding) => ({
      Source: "Validation",
      Code: finding.code,
      Severity: finding.severity,
      BlocksExport: finding.blocksExport ? "Yes" : "No",
      AffectedRecords: finding.affectedRecords
        .map((record) => `${record.sourceType}:${record.sourceId}`)
        .join("; "),
      Message: finding.message,
      Recommendation: finding.recommendation,
    })),
    ...plan.exceptions.map((exception) => ({
      Source: "Migration",
      Code: exception.code,
      Severity: exception.severity,
      BlocksExport: exception.severity === "error" ? "Yes" : "No",
      AffectedRecords: exception.entityId
        ? `${exception.entityType}:${exception.entityId}`
        : "",
      Message: exception.message,
      Recommendation: exception.recommendation,
    })),
  ];
  return {
    path: "reference-only/exceptions.csv",
    content: toCsv(rows, [
      "Source",
      "Code",
      "Severity",
      "BlocksExport",
      "AffectedRecords",
      "Message",
      "Recommendation",
    ]),
    contentType: "text/csv",
  };
}

function unsupportedRecordsCsv(
  report: ValidationReport,
  plan: MigrationPlan,
): ExportFile {
  const rows = [
    ...plan.exceptions
      .filter((item) => item.code.includes("UNSUPPORTED"))
      .map((item) => ({
        Code: item.code,
        EntityType: item.entityType,
        EntityId: item.entityId,
        EntityName: item.entityName,
        Message: item.message,
        Recommendation: item.recommendation,
      })),
    ...report.findings
      .filter((item) => item.code.includes("UNSUPPORTED"))
      .map((item) => ({
        Code: item.code,
        EntityType: item.entityType,
        EntityId: item.entityId,
        EntityName: item.affectedRecords
          .map((record) => record.label)
          .filter(Boolean)
          .join("; "),
        Message: item.message,
        Recommendation: item.recommendation,
      })),
  ];
  return {
    path: "unsupported/unsupported-records.csv",
    content: toCsv(rows, [
      "Code",
      "EntityType",
      "EntityId",
      "EntityName",
      "Message",
      "Recommendation",
    ]),
    contentType: "text/csv",
  };
}

function excludedRecordsCsv(report: ValidationReport): ExportFile {
  const rows = report.findings
    .filter((item) => item.blocksExport)
    .map((item) => ({
      Code: item.code,
      EntityType: item.entityType,
      EntityId: item.entityId,
      AffectedRecords: item.affectedRecords
        .map((record) => `${record.sourceType}:${record.sourceId}`)
        .join("; "),
      Reason: item.message,
      Recommendation: item.recommendation,
    }));
  return {
    path: "excluded/excluded-records.csv",
    content: toCsv(rows, [
      "Code",
      "EntityType",
      "EntityId",
      "AffectedRecords",
      "Reason",
      "Recommendation",
    ]),
    contentType: "text/csv",
  };
}

function readme(
  snapshot: AccountingSnapshot,
  report: ValidationReport,
): ExportFile {
  const content = `# QBO to Xero Migration Package

Generated by PreconFin for ${snapshot.organization.displayName}.

## Migration Score

${report.summary.score}/100 (${report.summary.readiness})

## Contents

### import-ready

Files shaped for Xero CSV import after review.

- import-ready/chart-of-accounts.csv
- import-ready/contacts.csv
- import-ready/items.csv
- import-ready/sales-invoices.csv
- import-ready/bills.csv
- import-ready/credit-notes.csv

### manual-configuration

Files that usually require accountant or migration specialist review before import.

- manual-configuration/manual-journals.csv
- manual-configuration/bank-statements.csv
- manual-configuration/opening-balances.csv

### reference-only

Evidence, mapping, and validation files.

- reference-only/mapping-report.csv
- reference-only/exceptions.csv
- reference-only/validation-report.json
- reference-only/migration-health-report.pdf

### unsupported and excluded

- unsupported/unsupported-records.csv
- excluded/excluded-records.csv

## Import Guidance

Version 1 does not write to Xero. Review all errors and warnings before importing files into Xero. Test the package in a Xero demo organization before production import. Reconcile AR, AP, bank balances, retained earnings, and tax balances after import.
`;
  return { path: "README.md", content, contentType: "text/markdown" };
}

async function zipFiles(files: ExportFile[]): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", (chunk) =>
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
  );
  const done = new Promise<Buffer>((resolve, reject) => {
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    archive.on("error", reject);
  });
  archive.pipe(stream);
  for (const file of files) archive.append(file.content, { name: file.path });
  await archive.finalize();
  return done;
}

export function createExportFiles(
  snapshot: AccountingSnapshot,
  plan: MigrationPlan,
  report: ValidationReport,
  pdf?: Buffer,
): ExportFile[] {
  const ctx = createContext(snapshot, plan);
  const files: ExportFile[] = [
    accountsCsv(snapshot, plan),
    contactsCsv(snapshot),
    itemsCsv(snapshot, ctx),
    invoicesCsv(snapshot, ctx),
    billsCsv(snapshot, ctx),
    creditsCsv(snapshot, ctx),
    journalsCsv(snapshot, ctx),
    bankStatementsCsv(snapshot, ctx),
    openingBalancesCsv(snapshot, ctx),
    mappingReportCsv(plan),
    exceptionsCsv(report, plan),
    unsupportedRecordsCsv(report, plan),
    excludedRecordsCsv(report),
    {
      path: "reference-only/validation-report.json",
      content: JSON.stringify(report, null, 2),
      contentType: "application/json",
    },
    readme(snapshot, report),
  ];
  if (pdf)
    files.push({
      path: "reference-only/migration-health-report.pdf",
      content: pdf,
      contentType: "application/pdf",
    });
  return files;
}

export async function createMigrationPackage(
  snapshot: AccountingSnapshot,
  plan: MigrationPlan,
  report: ValidationReport,
  pdf?: Buffer,
): Promise<MigrationPackage> {
  const files = createExportFiles(snapshot, plan, report, pdf);
  return { files, zip: await zipFiles(files) };
}

export { toCsv } from "./csv.js";
