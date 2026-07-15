import type { Account, AccountingSnapshot } from "@preconfin/canonical-model";
import { assessAccountRelevance } from "./account-relevance.js";
import type {
  AccountMigrationScope,
  AccountScopeSummary,
  MappingResult,
  MigrationException,
} from "./types.js";

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

function mappingDecisionReason(
  account: Account,
  targetType: string | undefined,
  targetCode: string,
  scope: AccountMigrationScope,
): string | undefined {
  if (scope.disposition === "excluded_unused_account") return undefined;
  if (!targetType) {
    return "The source account type has no deterministic Xero mapping.";
  }
  if (!/^[A-Za-z0-9._-]{1,10}$/.test(targetCode)) {
    return "The source account code is not valid for Xero.";
  }

  const type = normalizedType(account.sourceAccountType);
  const roles = new Set(scope.evidence.systemRoles);
  if (type === "creditcard") {
    return "Confirm the destination Xero credit-card bank account.";
  }
  if (roles.has("accounts_receivable")) {
    return "Confirm the destination Xero accounts-receivable system account.";
  }
  if (roles.has("accounts_payable")) {
    return "Confirm the destination Xero accounts-payable system account.";
  }
  if (roles.has("retained_earnings")) {
    return "Confirm the destination Xero retained-earnings system account.";
  }
  if (roles.has("opening_balance_equity")) {
    return "Confirm how opening-balance equity will be treated in Xero.";
  }
  if (roles.has("undeposited_funds")) {
    return "Confirm the destination clearing account for undeposited funds.";
  }
  if (roles.has("tax_liability")) {
    return "Confirm the destination Xero tax-liability account.";
  }
  return undefined;
}

function summarizeAccountScope(
  scopes: readonly AccountMigrationScope[],
): AccountScopeSummary {
  return {
    totalAccounts: scopes.length,
    relevantAccounts: scopes.filter(
      (scope) => scope.disposition !== "excluded_unused_account",
    ).length,
    autoMappedAccounts: scopes.filter(
      (scope) => scope.disposition === "auto_mapped",
    ).length,
    decisionRequiredAccounts: scopes.filter(
      (scope) => scope.disposition === "decision_required",
    ).length,
    excludedUnusedAccounts: scopes.filter(
      (scope) => scope.disposition === "excluded_unused_account",
    ).length,
  };
}

export function mapAccounts(snapshot: AccountingSnapshot): {
  mappings: MappingResult[];
  exceptions: MigrationException[];
  accountScope: AccountMigrationScope[];
  accountScopeSummary: AccountScopeSummary;
} {
  const exceptions: MigrationException[] = [];
  const scopeById = new Map(
    assessAccountRelevance(snapshot).map((scope) => [scope.sourceId, scope]),
  );
  const accounts = [...snapshot.accounts].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const mappings = accounts.map((account, index) => {
    const targetCode = accountCode(account, index);
    const resolvedTargetType = xeroAccountType(account);
    const scope = scopeById.get(account.id)!;
    const decisionReason = mappingDecisionReason(
      account,
      resolvedTargetType,
      targetCode,
      scope,
    );
    if (
      scope.disposition !== "excluded_unused_account" &&
      !resolvedTargetType
    ) {
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
    scopeById.set(account.id, {
      ...scope,
      disposition:
        scope.disposition === "excluded_unused_account"
          ? "excluded_unused_account"
          : decisionReason
            ? "decision_required"
            : "auto_mapped",
      decisionReason,
    });

    return {
      sourceId: account.id,
      sourceName: account.name,
      targetType: resolvedTargetType ?? "EXPENSE",
      targetCode,
      targetName: account.name,
      confidence: !resolvedTargetType ? ("low" as const) : ("high" as const),
      notes: mappingNotes(account),
    };
  });

  const relevantCodeGroups = new Map<string, string[]>();
  for (const mapping of mappings) {
    const scope = scopeById.get(mapping.sourceId)!;
    if (
      scope.disposition === "excluded_unused_account" ||
      !mapping.targetCode
    ) {
      continue;
    }
    const key = mapping.targetCode.toLowerCase();
    relevantCodeGroups.set(key, [
      ...(relevantCodeGroups.get(key) ?? []),
      mapping.sourceId,
    ]);
  }
  for (const sourceIds of relevantCodeGroups.values()) {
    if (sourceIds.length < 2) continue;
    for (const sourceId of sourceIds) {
      const scope = scopeById.get(sourceId)!;
      scopeById.set(sourceId, {
        ...scope,
        disposition: "decision_required",
        decisionReason:
          "More than one migration-relevant account uses the same Xero account code.",
      });
    }
  }

  const accountScope = [...scopeById.values()].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId),
  );
  return {
    mappings,
    exceptions,
    accountScope,
    accountScopeSummary: summarizeAccountScope(accountScope),
  };
}
