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
  taxMappings: MappingResult[];
  contactMappings: MappingResult[];
  itemMappings: MappingResult[];
  trackingMappings: MappingResult[];
  exceptions: MigrationException[];
  generatedAt: string;
}
