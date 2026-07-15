import type { Account, AccountingSnapshot } from "@preconfin/canonical-model";
import type { MappingResult, MigrationException } from "./types.js";

const xeroAccountTypeByClassification: Record<string, string> = {
  bank: "BANK",
  accounts_receivable: "CURRENT",
  accounts_payable: "CURRLIAB",
  asset: "CURRENT",
  liability: "CURRLIAB",
  equity: "EQUITY",
  revenue: "REVENUE",
  expense: "EXPENSE",
};

function normalizedType(value: string | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function xeroAccountType(account: Account): string | undefined {
  const type = normalizedType(account.sourceAccountType);
  const subtype = normalizedType(account.sourceAccountSubType);

  switch (type) {
    case "bank":
      return "BANK";
    case "creditcard":
      return "BANK";
    case "accountsreceivable":
      return "CURRENT";
    case "accountspayable":
      return "CURRLIAB";
    case "othercurrentasset":
      if (subtype === "inventory") return "INVENTORY";
      if (subtype === "prepaidexpenses") return "PREPAYMENT";
      return "CURRENT";
    case "fixedasset":
      return "FIXED";
    case "otherasset":
      return "NONCURRENT";
    case "othercurrentliability":
      return "CURRLIAB";
    case "longtermliability":
      return "TERMLIAB";
    case "equity":
      return "EQUITY";
    case "income":
      return "REVENUE";
    case "otherincome":
      return "OTHERINCOME";
    case "expense":
      return subtype === "depreciation" ? "DEPRECIATN" : "EXPENSE";
    case "costofgoodssold":
      return "DIRECTCOSTS";
    case "otherexpense":
      return "EXPENSE";
    case "nonposting":
      return undefined;
    default:
      return type
        ? undefined
        : xeroAccountTypeByClassification[account.classification];
  }
}

function accountCode(account: Account, index: number): string {
  if (account.code) return account.code;
  const base =
    account.classification === "revenue"
      ? 200
      : account.classification === "expense"
        ? 400
        : account.classification === "bank"
          ? 100
          : 800;
  return String(base + index).padStart(3, "0");
}

function mappingNotes(account: Account): string[] {
  const notes: string[] = [];
  if (!account.code) {
    notes.push(
      "Generated Xero account code because QuickBooks account number was empty.",
    );
  }
  if (normalizedType(account.sourceAccountType) === "creditcard") {
    notes.push(
      "Configure this Xero bank account with the credit-card bank account type.",
    );
  }
  return notes;
}

export function mapAccounts(snapshot: AccountingSnapshot): {
  mappings: MappingResult[];
  exceptions: MigrationException[];
} {
  const exceptions: MigrationException[] = [];
  const mappings = snapshot.accounts.map((account, index) => {
    const targetCode = accountCode(account, index);
    const resolvedTargetType = xeroAccountType(account);

    if (!account.active) {
      exceptions.push({
        code: "INACTIVE_ACCOUNT",
        severity: "warning",
        entityType: "account",
        entityId: account.id,
        entityName: account.name,
        message: "Inactive QuickBooks account detected.",
        recommendation:
          "Review whether this account should be imported, archived, or merged in Xero.",
      });
    }
    if (!resolvedTargetType) {
      exceptions.push({
        code: "UNSUPPORTED_ACCOUNT_TYPE",
        severity: "error",
        entityType: "account",
        entityId: account.id,
        entityName: account.name,
        message: `QuickBooks account type ${account.sourceAccountType ?? "unknown"} does not map cleanly to Xero.`,
        recommendation:
          "Choose an explicit Xero account type before migration.",
      });
    }

    const notes = mappingNotes(account);
    return {
      sourceId: account.id,
      sourceName: account.name,
      targetType: resolvedTargetType ?? "EXPENSE",
      targetCode,
      targetName: account.name,
      confidence: !resolvedTargetType
        ? ("low" as const)
        : notes.length
          ? ("medium" as const)
          : ("high" as const),
      notes,
    };
  });

  return { mappings, exceptions };
}
