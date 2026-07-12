import archiver from "archiver";
import { PassThrough } from "node:stream";
import type { AccountingSnapshot, Bill, Invoice } from "@preconfin/canonical-model";
import type { MigrationPlan } from "@preconfin/migration-engine";
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

function formatDate(value?: string): string {
  return value ?? "";
}

function amount(value: { amount: number }): string {
  return value.amount.toFixed(2);
}

function accountsCsv(snapshot: AccountingSnapshot, plan: MigrationPlan): ExportFile {
  const accountById = new Map(snapshot.accounts.map((account) => [account.id, account]));
  const rows = plan.accountMappings.map((mapping) => {
    const account = accountById.get(mapping.sourceId);
    return {
      Code: mapping.targetCode,
      Name: mapping.targetName,
      Type: mapping.targetType,
      TaxType: "NONE",
      Description: account?.fullyQualifiedName ?? account?.name ?? mapping.sourceName,
      Dashboard: account?.classification === "bank" ? "Yes" : "No",
      ExpenseClaims: account?.classification === "expense" ? "Yes" : "No",
      EnablePayments: account?.classification === "bank" ? "Yes" : "No"
    };
  });
  return { path: "csv/chart-of-accounts.csv", content: toCsv(rows, ["Code", "Name", "Type", "TaxType", "Description", "Dashboard", "ExpenseClaims", "EnablePayments"]), contentType: "text/csv" };
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
    ContactType: contact.type
  }));
  return { path: "csv/contacts.csv", content: toCsv(rows, ["ContactName", "AccountNumber", "EmailAddress", "FirstName", "LastName", "PhoneNumber", "PostalAddressLine1", "TaxNumber", "ContactType"]), contentType: "text/csv" };
}

function invoiceRows(invoices: Invoice[]): CsvRow[] {
  return invoices.flatMap((invoice) => invoice.lines.map((line) => ({
    InvoiceNumber: invoice.number,
    ContactName: line.contactId ?? invoice.contactId ?? "",
    InvoiceDate: formatDate(invoice.issueDate),
    DueDate: formatDate(invoice.dueDate),
    Description: line.description,
    Quantity: line.quantity ?? 1,
    UnitAmount: line.unitAmount ? amount(line.unitAmount) : amount(line.amount),
    AccountCode: line.accountId,
    TaxType: line.taxRateId ?? "NONE",
    Currency: invoice.total.currency,
    Status: invoice.status === "paid" ? "Paid" : "Approved"
  })));
}

function billRows(bills: Bill[]): CsvRow[] {
  return bills.flatMap((bill) => bill.lines.map((line) => ({
    BillNumber: bill.number,
    ContactName: line.contactId ?? bill.contactId ?? "",
    BillDate: formatDate(bill.issueDate),
    DueDate: formatDate(bill.dueDate),
    Description: line.description,
    Quantity: line.quantity ?? 1,
    UnitAmount: line.unitAmount ? amount(line.unitAmount) : amount(line.amount),
    AccountCode: line.accountId,
    TaxType: line.taxRateId ?? "NONE",
    Currency: bill.total.currency,
    Status: bill.status === "paid" ? "Paid" : "Approved"
  })));
}

function invoicesCsv(snapshot: AccountingSnapshot): ExportFile {
  return { path: "csv/invoices.csv", content: toCsv(invoiceRows(snapshot.invoices), ["InvoiceNumber", "ContactName", "InvoiceDate", "DueDate", "Description", "Quantity", "UnitAmount", "AccountCode", "TaxType", "Currency", "Status"]), contentType: "text/csv" };
}

function billsCsv(snapshot: AccountingSnapshot): ExportFile {
  return { path: "csv/bills.csv", content: toCsv(billRows(snapshot.bills), ["BillNumber", "ContactName", "BillDate", "DueDate", "Description", "Quantity", "UnitAmount", "AccountCode", "TaxType", "Currency", "Status"]), contentType: "text/csv" };
}

function itemsCsv(snapshot: AccountingSnapshot): ExportFile {
  const rows = snapshot.items.map((item) => ({
    ItemCode: item.sku ?? item.source.sourceId,
    ItemName: item.name,
    Description: item.description,
    PurchaseDescription: item.description,
    PurchaseUnitPrice: item.purchasePrice ? amount(item.purchasePrice) : "",
    SalesDescription: item.description,
    SalesUnitPrice: item.unitPrice ? amount(item.unitPrice) : "",
    SalesAccount: item.incomeAccountId,
    PurchaseAccount: item.expenseAccountId,
    InventoryAssetAccount: item.inventoryAssetAccountId
  }));
  return { path: "csv/items.csv", content: toCsv(rows, ["ItemCode", "ItemName", "Description", "PurchaseDescription", "PurchaseUnitPrice", "SalesDescription", "SalesUnitPrice", "SalesAccount", "PurchaseAccount", "InventoryAssetAccount"]), contentType: "text/csv" };
}

function journalsCsv(snapshot: AccountingSnapshot): ExportFile {
  const rows = snapshot.journals.flatMap((journal) => journal.lines.map((line) => ({
    Narration: journal.narration ?? journal.number ?? journal.id,
    Date: formatDate(journal.date),
    AccountCode: line.accountId,
    Description: line.description,
    Debit: line.side === "debit" ? amount(line.amount) : "",
    Credit: line.side === "credit" ? amount(line.amount) : "",
    TaxType: line.taxRateId ?? "NONE"
  })));
  return { path: "csv/manual-journals.csv", content: toCsv(rows, ["Narration", "Date", "AccountCode", "Description", "Debit", "Credit", "TaxType"]), contentType: "text/csv" };
}

function bankStatementsCsv(snapshot: AccountingSnapshot): ExportFile {
  const rows = snapshot.payments.map((payment) => ({
    Date: formatDate(payment.date),
    Amount: amount(payment.amount),
    Payee: payment.contactId ?? "",
    Description: payment.number ?? payment.id,
    Reference: payment.source.sourceId,
    Account: payment.accountId ?? ""
  }));
  return { path: "csv/bank-statements.csv", content: toCsv(rows, ["Date", "Amount", "Payee", "Description", "Reference", "Account"]), contentType: "text/csv" };
}

function openingBalancesCsv(snapshot: AccountingSnapshot): ExportFile {
  const rows = snapshot.balances.map((balance) => ({
    AccountCode: balance.accountId,
    Date: balance.asOfDate,
    Amount: amount(balance.amount),
    Currency: balance.amount.currency,
    Basis: balance.basis
  }));
  return { path: "csv/opening-balances.csv", content: toCsv(rows, ["AccountCode", "Date", "Amount", "Currency", "Basis"]), contentType: "text/csv" };
}

function mappingReportCsv(plan: MigrationPlan): ExportFile {
  const rows = [
    ...plan.accountMappings.map((mapping) => ({ Entity: "Account", SourceId: mapping.sourceId, SourceName: mapping.sourceName, TargetType: mapping.targetType, TargetCode: mapping.targetCode, TargetName: mapping.targetName, Confidence: mapping.confidence, Notes: mapping.notes.join("; ") })),
    ...plan.taxMappings.map((mapping) => ({ Entity: "TaxRate", SourceId: mapping.sourceId, SourceName: mapping.sourceName, TargetType: mapping.targetType, TargetCode: mapping.targetCode, TargetName: mapping.targetName, Confidence: mapping.confidence, Notes: mapping.notes.join("; ") })),
    ...plan.contactMappings.map((mapping) => ({ Entity: "Contact", SourceId: mapping.sourceId, SourceName: mapping.sourceName, TargetType: mapping.targetType, TargetCode: mapping.targetCode, TargetName: mapping.targetName, Confidence: mapping.confidence, Notes: mapping.notes.join("; ") }))
  ];
  return { path: "reports/mapping-report.csv", content: toCsv(rows, ["Entity", "SourceId", "SourceName", "TargetType", "TargetCode", "TargetName", "Confidence", "Notes"]), contentType: "text/csv" };
}

function exceptionsCsv(report: ValidationReport, plan: MigrationPlan): ExportFile {
  const rows = [
    ...report.findings.map((finding) => ({ Source: "Validation", Code: finding.code, Severity: finding.severity, EntityType: finding.entityType, EntityId: finding.entityId, Message: finding.message, Recommendation: finding.recommendation })),
    ...plan.exceptions.map((exception) => ({ Source: "Migration", Code: exception.code, Severity: exception.severity, EntityType: exception.entityType, EntityId: exception.entityId, Message: exception.message, Recommendation: exception.recommendation }))
  ];
  return { path: "reports/exceptions.csv", content: toCsv(rows, ["Source", "Code", "Severity", "EntityType", "EntityId", "Message", "Recommendation"]), contentType: "text/csv" };
}

function readme(snapshot: AccountingSnapshot, report: ValidationReport): ExportFile {
  const content = `# QBO to Xero Migration Package

Generated by PreconFin for ${snapshot.organization.displayName}.

## Migration Score

${report.summary.score}/100 (${report.summary.readiness})

## Contents

- csv/chart-of-accounts.csv
- csv/contacts.csv
- csv/invoices.csv
- csv/bills.csv
- csv/items.csv
- csv/manual-journals.csv
- csv/bank-statements.csv
- csv/opening-balances.csv
- reports/mapping-report.csv
- reports/exceptions.csv
- reports/validation-report.json

## Import Guidance

Review all errors and warnings before importing files into Xero. Test the package in a Xero demo organization before production import. Reconcile AR, AP, bank balances, retained earnings, and tax balances after import.
`;
  return { path: "README.md", content, contentType: "text/markdown" };
}

async function zipFiles(files: ExportFile[]): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
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

export function createExportFiles(snapshot: AccountingSnapshot, plan: MigrationPlan, report: ValidationReport, pdf?: Buffer): ExportFile[] {
  const files: ExportFile[] = [
    accountsCsv(snapshot, plan),
    contactsCsv(snapshot),
    invoicesCsv(snapshot),
    billsCsv(snapshot),
    itemsCsv(snapshot),
    journalsCsv(snapshot),
    bankStatementsCsv(snapshot),
    openingBalancesCsv(snapshot),
    mappingReportCsv(plan),
    exceptionsCsv(report, plan),
    { path: "reports/validation-report.json", content: JSON.stringify(report, null, 2), contentType: "application/json" },
    readme(snapshot, report)
  ];
  if (pdf) files.push({ path: "reports/migration-health-report.pdf", content: pdf, contentType: "application/pdf" });
  return files;
}

export async function createMigrationPackage(snapshot: AccountingSnapshot, plan: MigrationPlan, report: ValidationReport, pdf?: Buffer): Promise<MigrationPackage> {
  const files = createExportFiles(snapshot, plan, report, pdf);
  return { files, zip: await zipFiles(files) };
}

export { toCsv } from "./csv.js";
