import { describe, expect, it, vi } from "vitest";
import { EmailDeliveryError, ResendEmailSender } from "./email.js";

describe("ResendEmailSender", () => {
  it("uses the REST API with an idempotency key and returns the provider ID", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const sender = new ResendEmailSender(
      "re_secret",
      "PreconFin <hello@preconfin.com>",
      "https://api.resend.com",
      fetchImpl,
    );

    await expect(
      sender.send(
        {
          to: "operator@example.com",
          subject: "Subject",
          text: "Body",
          replyTo: "support@preconfin.com",
        },
        "lead-confirmation/lead_123",
      ),
    ).resolves.toEqual({ providerMessageId: "email_123" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_secret",
          "Idempotency-Key": "lead-confirmation/lead_123",
        }),
      }),
    );
  });

  it("returns a sanitized provider error without response content", async () => {
    const sender = new ResendEmailSender(
      "re_secret",
      "PreconFin <hello@preconfin.com>",
      "https://api.resend.com",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "operator@example.com and re_secret were rejected",
          }),
          { status: 422 },
        ),
      ),
    );

    await expect(
      sender.send(
        {
          to: "operator@example.com",
          subject: "Subject",
          text: "Body",
        },
        "lead-admin/lead_123",
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "EmailDeliveryError",
        message: "Email provider returned HTTP 422.",
        status: 422,
        code: "EMAIL_PROVIDER_REJECTED",
      } satisfies Partial<EmailDeliveryError>),
    );
  });
});
