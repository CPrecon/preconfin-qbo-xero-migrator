import { describe, expect, it, vi } from "vitest";
import { EmailDeliveryError, ResendEmailSender } from "./email.js";

describe("ResendEmailSender", () => {
  it("redacts transport failures before they reach diagnostics", async () => {
    const sender = new ResendEmailSender(
      "re_secret",
      "PreconFin <hello@preconfin.com>",
      "https://api.resend.com",
      vi
        .fn()
        .mockRejectedValue(
          new TypeError(
            "Invalid header Bearer re_secret for operator@example.com",
          ),
        ),
    );

    const failure = sender.send(
      {
        to: "operator@example.com",
        subject: "Subject",
        text: "Body",
      },
      "lead-admin/lead_transport",
    );

    await expect(failure).rejects.toMatchObject({
      name: "EmailDeliveryError",
      code: "EMAIL_PROVIDER_UNREACHABLE",
    });
    await expect(failure).rejects.not.toThrow(
      /re_secret|operator@example\.com/,
    );
  });

  it("invokes fetch without binding the sender as its receiver", async () => {
    let receiver: unknown = Symbol("not-called");
    const fetchImpl = vi.fn(function (this: unknown) {
      receiver = this;
      return Promise.resolve(
        new Response(JSON.stringify({ id: "email_worker" }), { status: 200 }),
      );
    });
    const sender = new ResendEmailSender(
      "re_secret",
      "PreconFin <hello@preconfin.com>",
      "https://api.resend.com",
      fetchImpl,
    );

    await sender.send(
      {
        to: "operator@example.com",
        subject: "Subject",
        text: "Body",
      },
      "lead-admin/lead_worker",
    );

    expect(receiver).toBeUndefined();
  });

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
