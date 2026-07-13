import { describe, expect, it } from "vitest";
import worker from "./worker.js";

const env = {
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
  TOKEN_ENCRYPTION_KEY: Buffer.from(
    "12345678901234567890123456789012",
  ).toString("base64"),
  OAUTH_STATE_SIGNING_SECRET: "12345678901234567890123456789012",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_STORAGE_BUCKET: "migration-artifacts",
  ARTIFACT_RETENTION_DAYS: "14",
  SIGNED_URL_TTL_SECONDS: "3600",
  POSTHOG_HOST: "https://us.i.posthog.com",
  LIVE_CERTIFICATION_MODE: "false",
};

describe("worker router", () => {
  it("allows only the configured production frontend origin for CORS", async () => {
    const productionEnv = {
      ...env,
      PUBLIC_APP_URL: "https://migrate.preconfin.com",
      PUBLIC_API_URL: "https://api-migrate.preconfin.com",
      CORS_ORIGINS: "https://migrate.preconfin.com",
      INTUIT_REDIRECT_URI:
        "https://api-migrate.preconfin.com/api/oauth/qbo/callback",
    };

    const allowed = await worker.fetch(
      new Request("https://api-migrate.preconfin.com/api/health", {
        method: "OPTIONS",
        headers: { origin: "https://migrate.preconfin.com" },
      }),
      productionEnv,
    );

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "https://migrate.preconfin.com",
    );
    expect(allowed.headers.get("vary")).toBe("Origin");

    const blocked = await worker.fetch(
      new Request("https://api-migrate.preconfin.com/api/health", {
        method: "OPTIONS",
        headers: { origin: "https://example.com" },
      }),
      productionEnv,
    );

    expect(blocked.status).toBe(204);
    expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("serves API health without Fastify", async () => {
    const response = await worker.fetch(
      new Request("https://api-migrate.preconfin.com/api/health"),
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "qbo-xero-migrator-api",
    });
  });
});
