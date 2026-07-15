import type { QboRawDataset } from "@preconfin/canonical-model";
import {
  parseFinancialAssessmentV1,
  toPublicMigrationAssessment,
} from "@preconfin/financial-assessment-engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../env.js";
import { encryptJson } from "../security/crypto.js";
import type { IntuitTokens } from "./intuit-oauth.js";
import {
  MigrationService,
  safeExceptionDetails,
  type MigrationDiagnosticLogger,
} from "./migration-service.js";
import { QboClient } from "./qbo-client.js";
import type { Repository } from "./repository.js";

const env: AppEnv = {
  NODE_ENV: "test",
  API_PORT: 4000,
  LOG_LEVEL: "silent",
  PUBLIC_APP_URL: "http://localhost:3000",
  PUBLIC_API_URL: "http://localhost:4000",
  CORS_ORIGINS: "http://localhost:3000",
  INTUIT_CLIENT_ID: "client",
  INTUIT_CLIENT_SECRET: "client-secret-value",
  INTUIT_REDIRECT_URI: "http://localhost:4000/api/oauth/qbo/callback",
  INTUIT_ENVIRONMENT: "sandbox",
  QBO_MINOR_VERSION: "75",
  QBO_REPORT_BASIS: "Accrual",
  TOKEN_ENCRYPTION_KEY: Buffer.from(
    "12345678901234567890123456789012",
  ).toString("base64"),
  OAUTH_STATE_SIGNING_SECRET: "state-signing-secret-value-123456",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-value",
  SUPABASE_STORAGE_BUCKET: "migration-artifacts",
  ARTIFACT_RETENTION_DAYS: 14,
  SIGNED_URL_TTL_SECONDS: 3600,
  POSTHOG_HOST: "https://us.i.posthog.com",
  LIVE_CERTIFICATION_MODE: false,
};

const tokens: IntuitTokens = {
  accessToken: "qbo-access-token-value",
  refreshToken: "qbo-refresh-token-value",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  refreshExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  tokenType: "bearer",
  scope: "com.intuit.quickbooks.accounting",
  realmId: "realm",
};

function repository(): Repository {
  return {
    getJob: vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      connectionId: "00000000-0000-4000-8000-000000000002",
      status: "queued",
    }),
    getConnectionById: vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000002",
      realmId: "realm",
      encryptedTokens: encryptJson(tokens, env.TOKEN_ENCRYPTION_KEY),
    }),
    updateJob: vi.fn().mockResolvedValue(undefined),
    audit: vi.fn().mockResolvedValue(undefined),
    uploadArtifact: vi.fn().mockResolvedValue(undefined),
    createArtifact: vi.fn().mockImplementation(async (input) => ({
      id: "00000000-0000-4000-8000-000000000003",
      ...input,
    })),
  } as unknown as Repository;
}

afterEach(() => vi.restoreAllMocks());

describe("migration failure diagnostics", () => {
  it("logs the original exception and stage while preserving the generic response", async () => {
    const original = new ReferenceError("missingWorkerGlobal is not defined");
    original.stack =
      "ReferenceError: missingWorkerGlobal is not defined\n    at worker-module.ts:42:7";
    vi.spyOn(QboClient.prototype, "fetchDataset").mockImplementation(
      async (onStage) => {
        onStage?.({
          stage: "transaction_extraction",
          sourceOperation: "query:Invoice",
        });
        throw original;
      },
    );
    const logger = vi.fn<MigrationDiagnosticLogger>();
    const service = new MigrationService(env, repository(), logger);

    await expect(
      service.runJob("00000000-0000-4000-8000-000000000001", "job-token", {
        correlationId: "ray-123",
        workerVersion: "version-123",
      }),
    ).rejects.toThrow(
      "Migration scan failed. Retry the scan or contact PreconFin if the issue continues.",
    );

    expect(logger).toHaveBeenCalledWith(
      "migration_scan_failed",
      expect.objectContaining({
        jobId: "00000000-0000-4000-8000-000000000001",
        executionStage: "transaction_extraction",
        sourceOperation: "query:Invoice",
        correlationId: "ray-123",
        workerVersion: "version-123",
        name: "ReferenceError",
        message: "missingWorkerGlobal is not defined",
        stack: expect.stringContaining("worker-module.ts:42:7"),
      }),
    );
  });

  it("persists FinancialAssessmentV1 as the authoritative JSON artifact", async () => {
    const raw: QboRawDataset = {
      realmId: "realm",
      companyInfo: {
        CompanyName: "Contract Fixture",
        LegalName: "Contract Fixture LLC",
        CurrencyRef: { value: "USD" },
      },
      accounts: [],
      customers: [],
      vendors: [],
      items: [],
      invoices: [],
      bills: [],
      payments: [],
      creditMemos: [],
      vendorCredits: [],
      journalEntries: [],
      taxRates: [],
      taxCodes: [],
      classes: [],
      departments: [],
      currencies: [],
      reports: {},
      pulledAt: "2026-06-30T12:00:00.000Z",
    };
    vi.spyOn(QboClient.prototype, "fetchDataset").mockResolvedValue(raw);
    const repo = repository();
    const service = new MigrationService(env, repo);

    const result = await service.runJob(
      "00000000-0000-4000-8000-000000000001",
      "job-token",
    );

    const uploads = vi
      .mocked(repo.uploadArtifact)
      .mock.calls.map(([input]) => input);
    expect(uploads).toHaveLength(3);
    expect(uploads.map((upload) => upload.contentType)).toEqual(
      expect.arrayContaining([
        "application/zip",
        "application/pdf",
        "application/json",
      ]),
    );
    const jsonUpload = uploads.find(
      (upload) => upload.contentType === "application/json",
    );
    expect(jsonUpload?.path).toMatch(/financial-assessment-v1\.json$/);
    expect(
      uploads.some((upload) => upload.path.endsWith("/validation-report.json")),
    ).toBe(false);

    const assessment = parseFinancialAssessmentV1(
      JSON.parse(jsonUpload!.body.toString("utf8")),
    );
    expect(assessment.reportVersion).toBe("1.0.0");
    expect(result).toEqual({
      score: assessment.scorecard.migrationReadiness.score,
      readiness: assessment.overallStatus,
      report: toPublicMigrationAssessment(assessment),
    });
    expect(JSON.stringify(result.report)).not.toMatch(
      /sourceId|decisionKey|occurrenceId/,
    );
    expect(repo.updateJob).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      expect.objectContaining({
        status: "completed",
        readinessScore: assessment.scorecard.migrationReadiness.score,
        readinessStatus: assessment.overallStatus,
      }),
    );
  });

  it("handles non-Error thrown values without exposing object fields", () => {
    expect(safeExceptionDetails({ accessToken: "must-not-log" })).toEqual({
      name: "NonErrorThrown",
      message: "Non-Error value thrown (object)",
    });
  });

  it("redacts known and secret-like values from messages and stacks", async () => {
    const original = new Error(
      `Bearer ${tokens.accessToken} client_secret=${env.INTUIT_CLIENT_SECRET}`,
    );
    original.stack = `${original.message}\n    at ${env.SUPABASE_SERVICE_ROLE_KEY}:1:1`;
    vi.spyOn(QboClient.prototype, "fetchDataset").mockRejectedValue(original);
    const logger = vi.fn<MigrationDiagnosticLogger>();
    const service = new MigrationService(env, repository(), logger);

    await expect(
      service.runJob(
        "00000000-0000-4000-8000-000000000001",
        "migration-token-value",
      ),
    ).rejects.toThrow("Migration scan failed");

    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).not.toContain(tokens.accessToken);
    expect(logged).not.toContain(tokens.refreshToken);
    expect(logged).not.toContain(env.INTUIT_CLIENT_SECRET);
    expect(logged).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY);
    expect(logged).not.toContain("migration-token-value");
    expect(logged).toContain("[redacted]");
  });
});
