import { normalizeQboDataset } from "@preconfin/canonical-model";
import { createMigrationPlan } from "@preconfin/migration-engine";
import { generateMigrationHealthPdf } from "@preconfin/pdf-report";
import { validateMigration } from "@preconfin/validation-engine";
import { createMigrationPackage } from "@preconfin/xero-export";
import type { AppEnv } from "../env.js";
import { decryptJson, encryptJson } from "../security/crypto.js";
import { randomToken } from "../security/tokens.js";
import type { IntuitTokens } from "./intuit-oauth.js";
import { IntuitOAuthClient } from "./intuit-oauth.js";
import { QboIntegrationError, QboClient } from "./qbo-client.js";
import type { Repository } from "./repository.js";

export class MigrationService {
  constructor(
    private readonly env: AppEnv,
    private readonly repo: Repository,
  ) {}

  async runJob(
    jobId: string,
    jobToken: string,
  ): Promise<{ score: number; readiness: string }> {
    const job = await this.repo.getJob(jobId, jobToken);
    if (!job)
      throw new Error("Migration job was not found or token is invalid");
    const connection = await this.repo.getConnectionById(job.connectionId);
    if (!connection) throw new Error("QuickBooks connection was not found");

    await this.repo.updateJob(job.id, {
      status: "running",
      errorMessage: undefined,
    });
    await this.repo.audit("migration_job_started", {
      jobId: job.id,
      connectionId: connection.id,
    });

    try {
      let tokens = decryptJson<IntuitTokens>(
        connection.encryptedTokens,
        this.env.TOKEN_ENCRYPTION_KEY,
      );
      if (new Date(tokens.refreshExpiresAt).getTime() < Date.now()) {
        throw new Error(
          "QuickBooks refresh token has expired. Reconnect QuickBooks and rerun the scan.",
        );
      }
      if (new Date(tokens.expiresAt).getTime() < Date.now() + 120000) {
        tokens = await new IntuitOAuthClient(this.env).refresh(
          tokens.refreshToken,
          connection.realmId,
        );
        await this.repo.updateConnectionTokens(
          connection.id,
          encryptJson(tokens, this.env.TOKEN_ENCRYPTION_KEY),
        );
      }

      const raw = await new QboClient(
        this.env,
        tokens.accessToken,
        connection.realmId,
      ).fetchDataset();
      const snapshot = normalizeQboDataset(raw);
      const plan = createMigrationPlan(snapshot);
      const validation = validateMigration(snapshot, plan);
      const pdf = await generateMigrationHealthPdf({
        snapshot,
        plan,
        validation,
      });
      const migrationPackage = await createMigrationPackage(
        snapshot,
        plan,
        validation,
        pdf,
      );

      const prefix = `${job.id}/${randomToken(18)}`;
      const zipPath = `${prefix}/qbo-xero-migration-package.zip`;
      const pdfPath = `${prefix}/migration-health-report.pdf`;
      const jsonPath = `${prefix}/validation-report.json`;

      await this.repo.uploadArtifact({
        bucket: this.env.SUPABASE_STORAGE_BUCKET,
        path: zipPath,
        body: migrationPackage.zip,
        contentType: "application/zip",
      });
      await this.repo.uploadArtifact({
        bucket: this.env.SUPABASE_STORAGE_BUCKET,
        path: pdfPath,
        body: pdf,
        contentType: "application/pdf",
      });
      await this.repo.uploadArtifact({
        bucket: this.env.SUPABASE_STORAGE_BUCKET,
        path: jsonPath,
        body: Buffer.from(JSON.stringify(validation, null, 2)),
        contentType: "application/json",
      });

      const expiresAt = new Date(
        Date.now() + this.env.ARTIFACT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      await this.repo.createArtifact({
        jobId: job.id,
        kind: "zip",
        path: zipPath,
        contentType: "application/zip",
        sizeBytes: migrationPackage.zip.length,
        expiresAt,
      });
      await this.repo.createArtifact({
        jobId: job.id,
        kind: "pdf",
        path: pdfPath,
        contentType: "application/pdf",
        sizeBytes: pdf.length,
        expiresAt,
      });
      await this.repo.createArtifact({
        jobId: job.id,
        kind: "json",
        path: jsonPath,
        contentType: "application/json",
        sizeBytes: Buffer.byteLength(JSON.stringify(validation)),
        expiresAt,
      });

      await this.repo.updateJob(job.id, {
        status: "completed",
        readinessScore: validation.summary.score,
        readinessStatus: validation.summary.readiness,
      });
      await this.repo.audit("migration_job_completed", {
        jobId: job.id,
        score: validation.summary.score,
        readiness: validation.summary.readiness,
      });
      return {
        score: validation.summary.score,
        readiness: validation.summary.readiness,
      };
    } catch (error) {
      const message = publicErrorMessage(error);
      await this.repo.updateJob(job.id, {
        status: "failed",
        errorMessage: message,
      });
      await this.repo.audit("migration_job_failed", {
        jobId: job.id,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
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
