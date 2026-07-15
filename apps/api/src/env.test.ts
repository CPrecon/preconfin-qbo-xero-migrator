import { describe, expect, it } from "vitest";
import { EnvValidationError, loadEnv } from "./env.js";

const validEnv = {
  NODE_ENV: "test",
  API_PORT: "4000",
  LOG_LEVEL: "silent",
  PUBLIC_APP_URL: "http://localhost:3000",
  PUBLIC_API_URL: "http://localhost:4000",
  CORS_ORIGINS: "http://localhost:3000",
  INTUIT_CLIENT_ID: "client",
  INTUIT_CLIENT_SECRET: "secret",
  INTUIT_REDIRECT_URI: "http://localhost:4000/api/oauth/qbo/callback",
  INTUIT_ENVIRONMENT: "sandbox",
  QBO_MINOR_VERSION: "75",
  QBO_REPORT_BASIS: "Accrual",
  TOKEN_ENCRYPTION_KEY: Buffer.from(
    "12345678901234567890123456789012",
  ).toString("base64"),
  OAUTH_STATE_SIGNING_SECRET: "12345678901234567890123456789012",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_STORAGE_BUCKET: "migration-artifacts",
  ARTIFACT_RETENTION_DAYS: "14",
  SIGNED_URL_TTL_SECONDS: "3600",
};

describe("loadEnv", () => {
  it("accepts a correctly shaped non-live environment", () => {
    expect(loadEnv(validEnv).SUPABASE_STORAGE_BUCKET).toBe(
      "migration-artifacts",
    );
  });

  it("rejects placeholder or malformed encryption settings", () => {
    expect(() =>
      loadEnv({
        ...validEnv,
        TOKEN_ENCRYPTION_KEY: "replace-with-32-byte-base64-key",
      }),
    ).toThrow(EnvValidationError);
  });

  it("requires staging-only settings in live certification mode", () => {
    try {
      loadEnv({ ...validEnv, LIVE_CERTIFICATION_MODE: "true" });
      throw new Error("Expected live certification environment to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect(error instanceof Error ? error.message : "").toContain(
        "PUBLIC_APP_URL",
      );
      expect(error instanceof Error ? error.message : "").toContain(
        "XERO_CLIENT_ID",
      );
      expect(error instanceof Error ? error.message : "").not.toContain(
        validEnv.INTUIT_CLIENT_SECRET,
      );
    }
  });
});
