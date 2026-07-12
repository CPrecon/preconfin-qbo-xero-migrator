export type ValidationSeverity = "pass" | "info" | "warning" | "error";

export interface ValidationFinding {
  code: string;
  severity: ValidationSeverity;
  title: string;
  message: string;
  recommendation: string;
  entityType?: string;
  entityId?: string;
}

export interface ValidationSummary {
  score: number;
  readiness: "ready" | "review_needed" | "blocked";
  errorCount: number;
  warningCount: number;
  infoCount: number;
  generatedAt: string;
}

export interface ValidationReport {
  summary: ValidationSummary;
  findings: ValidationFinding[];
  recommendations: string[];
}
