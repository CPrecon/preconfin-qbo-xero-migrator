import { normalizeQboDataset } from "@preconfin/canonical-model";
import {
  createFinancialAssessment,
  toPublicMigrationAssessment,
  type PublicMigrationAssessment,
} from "@preconfin/financial-assessment-engine";
import { createMigrationPlan } from "@preconfin/migration-engine";
import { generateMigrationHealthPdf } from "@preconfin/pdf-report";
import { toLegacyValidationReport } from "@preconfin/validation-engine";
import { createMigrationPackage } from "@preconfin/xero-export";
import type { AppEnv } from "../env.js";
import { decryptJson, encryptJson } from "../security/crypto.js";
import { randomToken } from "../security/tokens.js";
import type { IntuitTokens } from "./intuit-oauth.js";
import { IntuitOAuthClient } from "./intuit-oauth.js";
import {
  QboIntegrationError,
  QboClient,
  type QboExtractionStage,
} from "./qbo-client.js";
import type { Repository } from "./repository.js";

export type MigrationExecutionStage =
  | "connection_load"
  | "token_decrypt"
  | "qbo_client_creation"
  | QboExtractionStage
  | "normalization"
  | "validation"
  | "csv_generation"
  | "pdf_generation"
  | "zip_generation"
  | "artifact_persistence"
  | "audit_persistence";

export interface MigrationExecutionContext {
  correlationId?: string;
  workerVersion?: string;
}

export interface SafeExceptionDetails {
  name: string;
  message: string;
  stack?: string;
  causeName?: string;
  causeMessage?: string;
}

export interface MigrationFailureDiagnostic extends SafeExceptionDetails {
  jobId: string;
  executionStage: MigrationExecutionStage;
  sourceOperation: string;
  correlationId?: string;
  workerVersion?: string;
  elapsedMs: number;
}

export type MigrationDiagnosticLogger = (
  event: "migration_scan_failed",
  details: MigrationFailureDiagnostic,
) => void;

const defaultDiagnosticLogger: MigrationDiagnosticLogger = (event, details) => {
  console.error(event, details);
};

function sanitizeDiagnosticText(
  value: string,
  sensitiveValues: readonly string[],
): string {
  let sanitized = value;
  for (const secret of sensitiveValues) {
    if (secret.length >= 6)
      sanitized = sanitized.split(secret).join("[redacted]");
  }
  return sanitized
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /((?:access|refresh|migration)[_-]?token|client[_-]?secret|service[_-]?role[_-]?key)\s*[:=]\s*["']?[^\s"',}]+/gi,
      "$1=[redacted]",
    )
    .slice(0, 4000);
}

export function safeExceptionDetails(
  error: unknown,
  sensitiveValues: readonly string[] = [],
): SafeExceptionDetails {
  if (!(error instanceof Error)) {
    return {
      name: "NonErrorThrown",
      message:
        typeof error === "string"
          ? sanitizeDiagnosticText(error, sensitiveValues)
          : `Non-Error value thrown (${error === null ? "null" : typeof error})`,
    };
  }

  const details: SafeExceptionDetails = {
    name: error.name || "Error",
    message: sanitizeDiagnosticText(
      error.message || "Unknown error",
      sensitiveValues,
    ),
  };
  if (error.stack) {
    details.stack = sanitizeDiagnosticText(
      error.stack.split("\n").slice(0, 12).join("\n"),
      sensitiveValues,
    );
  }
  if (error.cause instanceof Error) {
    details.causeName = error.cause.name || "Error";
    details.causeMessage = sanitizeDiagnosticText(
      error.cause.message || "Unknown error",
      sensitiveValues,
    );
  }
  return details;
}

export class MigrationService {
  constructor(
    private readonly env: AppEnv,
    private readonly repo: Repository,
    private readonly diagnosticLogger: MigrationDiagnosticLogger = defaultDiagnosticLogger,
  ) {}

  async runJob(
    jobId: string,
    jobToken: string,
    executionContext: MigrationExecutionContext = {},
  ): Promise<{
    score: number;
    readiness: string;
    report: PublicMigrationAssessment;
  }> {
    const startedAt = Date.now();
    let stage: MigrationExecutionStage = "connection_load";
    let sourceOperation = "repository.getJob";
    let loadedJobId: string | undefined;
    const sensitiveValues = [
      jobToken,
      this.env.INTUIT_CLIENT_SECRET,
      this.env.TOKEN_ENCRYPTION_KEY,
      this.env.OAUTH_STATE_SIGNING_SECRET,
      this.env.SUPABASE_SERVICE_ROLE_KEY,
    ];

    try {
      const job = await this.repo.getJob(jobId, jobToken);
      if (!job)
        throw new Error("Migration job was not found or token is invalid");
      loadedJobId = job.id;

      sourceOperation = "repository.getConnectionById";
      const connection = await this.repo.getConnectionById(job.connectionId);
      if (!connection) throw new Error("QuickBooks connection was not found");

      stage = "audit_persistence";
      sourceOperation = "repository.updateJob:running";
      await this.repo.updateJob(job.id, {
        status: "running",
        errorMessage: undefined,
      });
      sourceOperation = "repository.audit:migration_job_started";
      await this.repo.audit("migration_job_started", {
        jobId: job.id,
        connectionId: connection.id,
      });

      stage = "token_decrypt";
      sourceOperation = "decryptJson:IntuitTokens";
      let tokens = decryptJson<IntuitTokens>(
        connection.encryptedTokens,
        this.env.TOKEN_ENCRYPTION_KEY,
      );
      sensitiveValues.push(tokens.accessToken, tokens.refreshToken);
      if (new Date(tokens.refreshExpiresAt).getTime() < Date.now()) {
        throw new Error(
          "QuickBooks refresh token has expired. Reconnect QuickBooks and rerun the scan.",
        );
      }
      if (new Date(tokens.expiresAt).getTime() < Date.now() + 120000) {
        sourceOperation = "IntuitOAuthClient.refresh";
        tokens = await new IntuitOAuthClient(this.env).refresh(
          tokens.refreshToken,
          connection.realmId,
        );
        sensitiveValues.push(tokens.accessToken, tokens.refreshToken);
        sourceOperation = "repository.updateConnectionTokens";
        await this.repo.updateConnectionTokens(
          connection.id,
          encryptJson(tokens, this.env.TOKEN_ENCRYPTION_KEY),
        );
      }

      stage = "qbo_client_creation";
      sourceOperation = "QboClient.constructor";
      const qboClient = new QboClient(
        this.env,
        tokens.accessToken,
        connection.realmId,
      );
      const raw = await qboClient.fetchDataset((progress) => {
        stage = progress.stage;
        sourceOperation = progress.sourceOperation;
      });

      stage = "normalization";
      sourceOperation = "normalizeQboDataset";
      const snapshot = normalizeQboDataset(raw);
      sourceOperation = "createMigrationPlan";
      const plan = createMigrationPlan(snapshot);

      const assessmentGeneratedAt = new Date().toISOString();
      stage = "validation";
      sourceOperation = "createFinancialAssessment";
      const assessment = createFinancialAssessment({
        snapshot,
        plan,
        assessmentType: "migration_readiness",
        generatedAt: assessmentGeneratedAt,
      });
      sourceOperation = "toLegacyValidationReport";
      const validation = toLegacyValidationReport(assessment);

      stage = "pdf_generation";
      sourceOperation = "generateMigrationHealthPdf";
      const pdf = await generateMigrationHealthPdf({
        snapshot,
        plan,
        validation,
        assessment,
      });

      const migrationPackage = await createMigrationPackage(
        snapshot,
        plan,
        validation,
        pdf,
        (packageStage) => {
          stage = packageStage;
          sourceOperation =
            packageStage === "csv_generation"
              ? "createExportFiles"
              : "zipFiles";
        },
      );

      const prefix = `${job.id}/${randomToken(18)}`;
      const zipPath = `${prefix}/qbo-xero-migration-package.zip`;
      const pdfPath = `${prefix}/migration-health-report.pdf`;
      const jsonPath = `${prefix}/financial-assessment-v1.json`;
      const json = JSON.stringify(assessment, null, 2);

      stage = "artifact_persistence";
      sourceOperation = "repository.uploadArtifact:zip";
      await this.repo.uploadArtifact({
        bucket: this.env.SUPABASE_STORAGE_BUCKET,
        path: zipPath,
        body: migrationPackage.zip,
        contentType: "application/zip",
      });
      sourceOperation = "repository.uploadArtifact:pdf";
      await this.repo.uploadArtifact({
        bucket: this.env.SUPABASE_STORAGE_BUCKET,
        path: pdfPath,
        body: pdf,
        contentType: "application/pdf",
      });
      sourceOperation = "repository.uploadArtifact:json";
      await this.repo.uploadArtifact({
        bucket: this.env.SUPABASE_STORAGE_BUCKET,
        path: jsonPath,
        body: Buffer.from(json),
        contentType: "application/json",
      });

      const expiresAt = new Date(
        Date.now() + this.env.ARTIFACT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      sourceOperation = "repository.createArtifact:zip";
      await this.repo.createArtifact({
        jobId: job.id,
        kind: "zip",
        path: zipPath,
        contentType: "application/zip",
        sizeBytes: migrationPackage.zip.length,
        expiresAt,
      });
      sourceOperation = "repository.createArtifact:pdf";
      await this.repo.createArtifact({
        jobId: job.id,
        kind: "pdf",
        path: pdfPath,
        contentType: "application/pdf",
        sizeBytes: pdf.length,
        expiresAt,
      });
      sourceOperation = "repository.createArtifact:json";
      await this.repo.createArtifact({
        jobId: job.id,
        kind: "json",
        path: jsonPath,
        contentType: "application/json",
        sizeBytes: Buffer.byteLength(json),
        expiresAt,
      });

      stage = "audit_persistence";
      sourceOperation = "repository.updateJob:completed";
      await this.repo.updateJob(job.id, {
        status: "completed",
        readinessScore: assessment.scorecard.migrationReadiness.score,
        readinessStatus: assessment.overallStatus,
      });
      sourceOperation = "repository.audit:migration_job_completed";
      const publicReport = toPublicMigrationAssessment(assessment);
      await this.repo.audit("migration_job_completed", {
        jobId: job.id,
        score: assessment.scorecard.migrationReadiness.score,
        readiness: assessment.overallStatus,
      });
      return {
        score: assessment.scorecard.migrationReadiness.score,
        readiness: assessment.overallStatus,
        report: publicReport,
      };
    } catch (error) {
      this.diagnosticLogger("migration_scan_failed", {
        jobId,
        executionStage: stage,
        sourceOperation,
        correlationId: executionContext.correlationId,
        workerVersion: executionContext.workerVersion,
        elapsedMs: Date.now() - startedAt,
        ...safeExceptionDetails(error, sensitiveValues),
      });
      const message = publicErrorMessage(error);
      if (loadedJobId) {
        await this.repo.updateJob(loadedJobId, {
          status: "failed",
          errorMessage: message,
        });
        await this.repo.audit("migration_job_failed", {
          jobId: loadedJobId,
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
      }
      throw new Error(message);
    }
  }
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof QboIntegrationError) {
    if (error.statusCode === 401 || error.statusCode === 403)
      return "QuickBooks authorization failed. Reconnect QuickBooks and rerun the scan.";
    if (error.statusCode === 429)
      return "QuickBooks rate limit was reached. Wait a few minutes and rerun the scan.";
    return "QuickBooks extraction failed. Review your connection and rerun the scan.";
  }
  if (error instanceof Error && error.message.includes("refresh token"))
    return error.message;
  return "Migration scan failed. Retry the scan or contact PreconFin if the issue continues.";
}
