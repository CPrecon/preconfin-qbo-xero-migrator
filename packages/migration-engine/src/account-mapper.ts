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
  other: "EXPENSE",
};

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

export function mapAccounts(snapshot: AccountingSnapshot): {
  mappings: MappingResult[];
  exceptions: MigrationException[];
} {
  const seenCodes = new Set<string>();
  const exceptions: MigrationException[] = [];
  const mappings = snapshot.accounts.map((account, index) => {
    const targetCode = accountCode(account, index);
    if (seenCodes.has(targetCode)) {
      exceptions.push({
        code: "DUPLICATE_ACCOUNT_CODE",
        severity: "warning",
        entityType: "account",
        entityId: account.id,
        entityName: account.name,
        message: `Multiple accounts map to code ${targetCode}.`,
        recommendation: "Assign a unique Xero account code before import.",
      });
    }
    seenCodes.add(targetCode);

    const targetType =
      xeroAccountTypeByClassification[account.classification] ?? "EXPENSE";
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
    if (account.classification === "other") {
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

    return {
      sourceId: account.id,
      sourceName: account.name,
      targetType,
      targetCode,
      targetName: account.name,
      confidence:
        account.classification === "other"
          ? ("low" as const)
          : account.code
            ? ("high" as const)
            : ("medium" as const),
      notes: account.code
        ? []
        : [
            "Generated Xero account code because QuickBooks account number was empty.",
          ],
    };
  });

  return { mappings, exceptions };
}
