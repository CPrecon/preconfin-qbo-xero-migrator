import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

const env = {
  NODE_ENV: "test" as const,
  API_PORT: 4000,
  LOG_LEVEL: "silent",
  PUBLIC_APP_URL: "http://localhost:3000",
  PUBLIC_API_URL: "http://localhost:4000",
  CORS_ORIGINS: "http://localhost:3000",
  INTUIT_CLIENT_ID: "client",
  INTUIT_CLIENT_SECRET: "secret",
  INTUIT_REDIRECT_URI: "http://localhost:4000/api/oauth/qbo/callback",
  INTUIT_ENVIRONMENT: "sandbox" as const,
  QBO_MINOR_VERSION: "75",
  TOKEN_ENCRYPTION_KEY: Buffer.from(
    "12345678901234567890123456789012",
  ).toString("base64"),
  OAUTH_STATE_SIGNING_SECRET: "12345678901234567890123456789012",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_STORAGE_BUCKET: "migration-artifacts",
  ARTIFACT_RETENTION_DAYS: 14,
  SIGNED_URL_TTL_SECONDS: 3600,
  POSTHOG_HOST: "https://us.i.posthog.com",
  LIVE_CERTIFICATION_MODE: false,
};

describe("server", () => {
  it("serves health", async () => {
    const app = await buildServer(env);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
  });

  it("rejects an invalid OAuth callback state before token exchange", async () => {
    const app = await buildServer(env);
    const response = await app.inject({
      method: "GET",
      url: "/api/oauth/qbo/callback?code=abc&realmId=realm&state=bad",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("Invalid OAuth state");
  });
});
