import { describe, expect, it } from "vitest";
import { loadEnv } from "../env.js";
import { IntuitOAuthClient } from "./intuit-oauth.js";

describe("IntuitOAuthClient", () => {
  it("builds a production authorization URL with the configured callback", () => {
    const env = loadEnv({
      NODE_ENV: "test",
      PUBLIC_APP_URL: "https://migrate.preconfin.com",
      PUBLIC_API_URL: "https://api-migrate.preconfin.com",
      CORS_ORIGINS: "https://migrate.preconfin.com",
      INTUIT_CLIENT_ID: "client",
      INTUIT_CLIENT_SECRET: "secret",
      INTUIT_REDIRECT_URI:
        "https://api-migrate.preconfin.com/api/oauth/qbo/callback",
      INTUIT_ENVIRONMENT: "production",
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
    });

    const url = new URL(
      new IntuitOAuthClient(env).authorizationUrl("state", "challenge"),
    );

    expect(url.origin).toBe("https://appcenter.intuit.com");
    expect(url.pathname).toBe("/connect/oauth2");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api-migrate.preconfin.com/api/oauth/qbo/callback",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.toString()).not.toContain("workers.dev");
    expect(url.toString()).not.toContain("localhost");
  });
});
