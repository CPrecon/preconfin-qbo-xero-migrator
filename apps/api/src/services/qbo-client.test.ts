import { afterEach, describe, expect, it, vi } from "vitest";
import { QboClient, QboIntegrationError } from "./qbo-client.js";

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
  QBO_MINOR_VERSION: "77",
  QBO_REPORT_BASIS: "Accrual",
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

afterEach(() => vi.unstubAllGlobals());

describe("QboClient", () => {
  it("uses configured minor version and extracts required read-only sources", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes("companyinfo"))
          return Response.json({
            CompanyInfo: {
              CompanyName: "Sandbox",
              CurrencyRef: { value: "USD" },
            },
          });
        if (url.includes("reports"))
          return Response.json({ Rows: { Row: [] } });
        return Response.json({ QueryResponse: {} });
      }),
    );

    const dataset = await new QboClient(env, "token", "realm").fetchDataset();
    expect(dataset.taxCodes).toEqual([]);
    expect(dataset.reports.arAging).toBeDefined();
    expect(urls.every((url) => url.includes("minorversion=77"))).toBe(true);
    expect(urls.some((url) => url.includes("TaxCode"))).toBe(true);
    expect(urls.some((url) => url.includes("AgedReceivables"))).toBe(true);
    expect(urls.some((url) => url.includes("AgedPayables"))).toBe(true);
    expect(
      urls
        .filter((url) => url.includes("/reports/"))
        .every((url) => url.includes("accounting_method=Accrual")),
    ).toBe(true);
  });

  it("throws structured integration errors without response body leakage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("sensitive body", { status: 400 })),
    );
    try {
      await new QboClient(env, "token", "realm").fetchDataset();
      throw new Error("Expected extraction to fail");
    } catch (error) {
      expect(error).toMatchObject({
        name: "QboIntegrationError",
        statusCode: 400,
      });
      expect(error instanceof Error ? error.message : "").not.toContain(
        "sensitive body",
      );
    }
  });
});
