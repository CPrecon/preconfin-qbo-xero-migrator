import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../env.js";
import type { EmailSender } from "./email.js";
import { EmailDeliveryError } from "./email.js";
import {
  LeadService,
  type LeadDeliveryUpdate,
  type LeadEmailKind,
  type LeadRepository,
  type LeadSubmission,
} from "./lead-service.js";

const env = {
  NODE_ENV: "test",
  API_PORT: 4000,
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
  ARTIFACT_RETENTION_DAYS: 14,
  SIGNED_URL_TTL_SECONDS: 3600,
  POSTHOG_HOST: "https://us.i.posthog.com",
  RESEND_API_URL: "https://api.resend.com",
  RESEND_API_KEY: "re_secret",
  CONTACT_ADMIN_EMAIL: "admin@preconfin.com",
  CONTACT_FROM_EMAIL: "hello@preconfin.com",
  LIVE_CERTIFICATION_MODE: false,
} satisfies AppEnv;

const submission: LeadSubmission = {
  email: "operator@example.com",
  name: "Operator",
  company: "Example Company",
  source: "contact",
};

function repository(order: string[]): LeadRepository {
  return {
    saveLead: vi.fn(async () => {
      order.push("persist");
      return { id: "lead_123" };
    }),
    updateLeadDelivery: vi.fn(
      async (
        _leadId: string,
        kind: LeadEmailKind,
        update: LeadDeliveryUpdate,
      ) => {
        order.push(`status:${kind}:${update.status}`);
      },
    ),
    audit: vi.fn(async (event: string) => {
      order.push(`audit:${event}`);
    }),
  };
}

describe("LeadService", () => {
  it("never attempts email when durable persistence fails", async () => {
    const sender: EmailSender = {
      send: vi.fn(),
    };
    const repo = repository([]);
    vi.mocked(repo.saveLead).mockRejectedValueOnce(
      new Error("lead persistence unavailable"),
    );

    await expect(
      new LeadService(env, repo, sender).submit(submission),
    ).rejects.toThrow("lead persistence unavailable");
    expect(sender.send).not.toHaveBeenCalled();
    expect(repo.updateLeadDelivery).not.toHaveBeenCalled();
  });

  it("persists the lead before attempting either email", async () => {
    const order: string[] = [];
    const sender: EmailSender = {
      send: vi.fn(async (_message, key) => {
        order.push(`send:${key}`);
        return { providerMessageId: `provider_${key}` };
      }),
    };
    const repo = repository(order);
    const result = await new LeadService(env, repo, sender).submit(submission);

    expect(order[0]).toBe("persist");
    expect(result).toEqual({
      ok: true,
      persisted: true,
      notifications: { admin: "sent", confirmation: "sent" },
    });
    expect(repo.updateLeadDelivery).toHaveBeenCalledTimes(2);
  });

  it("keeps the lead accepted and attempts confirmation when admin email fails", async () => {
    const order: string[] = [];
    const sender: EmailSender = {
      send: vi.fn(async (_message, key) => {
        if (key.startsWith("lead-admin")) {
          throw new EmailDeliveryError(
            "Email provider returned HTTP 503.",
            503,
            "EMAIL_PROVIDER_REJECTED",
          );
        }
        return { providerMessageId: "confirmation_123" };
      }),
    };
    const diagnostics = vi.fn();
    const repo = repository(order);
    const result = await new LeadService(env, repo, sender, diagnostics).submit(
      submission,
    );

    expect(result).toEqual({
      ok: true,
      persisted: true,
      notifications: { admin: "failed", confirmation: "sent" },
    });
    expect(repo.saveLead).toHaveBeenCalledOnce();
    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(diagnostics).toHaveBeenCalledWith(
      "lead_email_delivery_failed",
      expect.objectContaining({
        leadId: "lead_123",
        deliveryKind: "admin",
        status: 503,
        code: "EMAIL_PROVIDER_REJECTED",
      }),
    );
  });

  it("does not log addresses, provider keys, or message content on failure", async () => {
    const diagnostics = vi.fn();
    const sender: EmailSender = {
      send: vi.fn(async () => {
        throw new Error(
          "operator@example.com re_secret confidential email body",
        );
      }),
    };
    const result = await new LeadService(
      env,
      repository([]),
      sender,
      diagnostics,
    ).submit(submission);

    expect(result.persisted).toBe(true);
    const serialized = JSON.stringify(diagnostics.mock.calls);
    expect(serialized).not.toContain(submission.email);
    expect(serialized).not.toContain("re_secret");
    expect(serialized).not.toContain("confidential email body");
  });
});
