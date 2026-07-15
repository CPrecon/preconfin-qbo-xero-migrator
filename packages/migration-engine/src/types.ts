export type MigrationSeverity = "info" | "warning" | "error";

export interface MappingResult {
  sourceId: string;
  sourceName: string;
  targetType: string;
  targetCode?: string;
  targetName: string;
  confidence: "high" | "medium" | "low";
  notes: string[];
}

export type AccountRelevanceReason =
  | "non_zero_opening_balance"
  | "non_zero_conversion_balance"
  | "non_zero_closing_balance"
  | "period_activity"
  | "open_document_dependency"
  | "item_dependency"
  | "tax_dependency"
  | "exported_record_dependency"
  | "required_system_account"
  | "unresolved_relationship";

export type AccountMappingDisposition =
  "auto_mapped" | "decision_required" | "excluded_unused_account";

export interface AccountRelevanceEvidence {
  openingBalance: number;
  conversionBalance: number;
  closingBalance: number;
  periodDebitActivity: number;
  periodCreditActivity: number;
  transactionCount: number;
  openDocumentReferenceCount: number;
  itemReferenceCount: number;
  taxDependencyCount: number;
  exportedRecordReferenceCount: number;
  unresolvedRelationshipCount: number;
  systemRoles: string[];
  active: boolean;
  tolerance: number;
}

export interface AccountMigrationScope {
  sourceId: string;
  disposition: AccountMappingDisposition;
  relevanceReasons: AccountRelevanceReason[];
  decisionReason?: string;
  evidence: AccountRelevanceEvidence;
}

export interface AccountScopeSummary {
  totalAccounts: number;
  relevantAccounts: number;
  autoMappedAccounts: number;
  decisionRequiredAccounts: number;
  excludedUnusedAccounts: number;
}

export interface MigrationException {
  code: string;
  severity: MigrationSeverity;
  entityType: string;
  entityId?: string;
  entityName?: string;
  message: string;
  recommendation: string;
}

export interface MigrationPlan {
  accountMappings: MappingResult[];
  accountScope?: AccountMigrationScope[];
  accountScopeSummary?: AccountScopeSummary;
  taxMappings: MappingResult[];
  contactMappings: MappingResult[];
  itemMappings: MappingResult[];
  trackingMappings: MappingResult[];
  exceptions: MigrationException[];
  generatedAt: string;
}
