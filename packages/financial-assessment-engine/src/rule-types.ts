export type RuleSeverity = "pass" | "info" | "warning" | "error";

export interface AffectedSourceRecord {
  sourceId: string;
  sourceType: string;
  label?: string;
}

export interface RuleFinding {
  code: string;
  severity: RuleSeverity;
  title: string;
  message: string;
  recommendation: string;
  affectedRecords: AffectedSourceRecord[];
  blocksExport: boolean;
  entityType?: string;
  entityId?: string;
}
