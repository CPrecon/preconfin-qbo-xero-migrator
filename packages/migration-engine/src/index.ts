import type { AccountingSnapshot } from "@preconfin/canonical-model";
import { mapAccounts } from "./account-mapper.js";
import type {
  MappingResult,
  MigrationException,
  MigrationPlan,
} from "./types.js";

function byNameMapping(
  sourceId: string,
  sourceName: string,
  targetType: string,
  notes: string[] = [],
  reviewStatus: MappingResult["reviewStatus"] = "automatically_accepted",
  rationale = "The source record has one standard Xero treatment.",
): MappingResult {
  const confidencePercentage =
    reviewStatus === "requires_review" ? 75 : notes.length ? 95 : 99;
  return {
    sourceId,
    sourceName,
    targetType,
    targetName: sourceName,
    confidence:
      confidencePercentage >= 90
        ? "high"
        : confidencePercentage >= 70
          ? "medium"
          : "low",
    confidencePercentage,
    rationale,
    reviewStatus,
    notes,
  };
}

export function createMigrationPlan(
  snapshot: AccountingSnapshot,
): MigrationPlan {
  const accountResult = mapAccounts(snapshot);
  const itemExceptions: MigrationException[] = snapshot.items
    .filter((item) => item.isInventory)
    .map((item) => ({
      code: "UNSUPPORTED_INVENTORY_ITEM",
      severity: "warning" as const,
      entityType: "item",
      entityId: item.id,
      entityName: item.name,
      message: "Inventory items require manual review for Xero CSV import.",
      recommendation:
        "Convert inventory items to tracked inventory during assisted migration or import them as non-inventory items for v1 CSV migration.",
    }));

  const exceptions: MigrationException[] = [
    ...accountResult.exceptions,
    ...itemExceptions,
  ];

  return {
    accountMappings: accountResult.mappings,
    accountScope: accountResult.accountScope,
    accountScopeSummary: accountResult.accountScopeSummary,
    taxMappings: (snapshot.taxCodes ?? snapshot.taxRates).map((tax) =>
      byNameMapping(
        tax.id,
        tax.name,
        "TaxRate",
        [
          "rate" in tax
            ? `Rate: ${tax.rate}%`
            : `Sales rate: ${tax.salesRate ?? 0}%`,
        ],
        "requires_review",
        "The QuickBooks tax rate must be matched to an available Xero tax rate.",
      ),
    ),
    contactMappings: snapshot.contacts.map((contact) =>
      byNameMapping(
        contact.id,
        contact.name,
        contact.type === "supplier" ? "Supplier" : "Customer",
      ),
    ),
    itemMappings: snapshot.items.map((item) =>
      byNameMapping(
        item.id,
        item.name,
        item.isInventory ? "InventoryItemReview" : "Item",
        [],
        item.isInventory ? "requires_review" : "automatically_accepted",
        item.isInventory
          ? "Tracked inventory treatment requires confirmation in Xero."
          : "The QuickBooks product or service has a standard Xero item treatment.",
      ),
    ),
    trackingMappings: snapshot.tracking.map((tracking) =>
      byNameMapping(
        tracking.id,
        tracking.option,
        tracking.name,
        [],
        "requires_review",
        "QuickBooks classes and locations require a confirmed Xero tracking-category design.",
      ),
    ),
    exceptions,
    generatedAt: new Date().toISOString(),
  };
}

export type {
  AccountMappingDisposition,
  AccountMigrationScope,
  AccountRelevanceEvidence,
  AccountRelevanceReason,
  AccountScopeSummary,
  MappingResult,
  MigrationException,
  MigrationPlan,
} from "./types.js";
export { assessAccountRelevance } from "./account-relevance.js";
export { mapAccounts } from "./account-mapper.js";
