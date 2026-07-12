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
): MappingResult {
  return {
    sourceId,
    sourceName,
    targetType,
    targetName: sourceName,
    confidence: notes.length ? "medium" : "high",
    notes,
  };
}

function duplicateExceptions(
  entityType: string,
  values: Array<{ id: string; name: string }>,
): MigrationException[] {
  const seen = new Map<string, Array<{ id: string; name: string }>>();
  for (const value of values) {
    const key = value.name.trim().toLowerCase();
    seen.set(key, [...(seen.get(key) ?? []), value]);
  }
  return [...seen.values()]
    .filter((group) => group.length > 1)
    .flatMap((group) =>
      group.map((value) => ({
        code: `DUPLICATE_${entityType.toUpperCase()}`,
        severity: "warning" as const,
        entityType,
        entityId: value.id,
        entityName: value.name,
        message: `Duplicate ${entityType} name detected: ${value.name}.`,
        recommendation: "Merge or rename duplicates before importing to Xero.",
      })),
    );
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
    ...duplicateExceptions(
      "contact",
      snapshot.contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
      })),
    ),
    ...duplicateExceptions(
      "account",
      snapshot.accounts.map((account) => ({
        id: account.id,
        name: account.name,
      })),
    ),
    ...itemExceptions,
  ];

  return {
    accountMappings: accountResult.mappings,
    taxMappings: snapshot.taxRates.map((tax) =>
      byNameMapping(tax.id, tax.name, "TaxRate", [`Rate: ${tax.rate}%`]),
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
      ),
    ),
    trackingMappings: snapshot.tracking.map((tracking) =>
      byNameMapping(tracking.id, tracking.option, tracking.name),
    ),
    exceptions,
    generatedAt: new Date().toISOString(),
  };
}

export type {
  MappingResult,
  MigrationException,
  MigrationPlan,
} from "./types.js";
export { mapAccounts } from "./account-mapper.js";
