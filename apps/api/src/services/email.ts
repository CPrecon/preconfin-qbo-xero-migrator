import type { AppEnv } from "../env.js";

export interface OutboundEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly replyTo?: string;
}

export interface EmailDeliveryResult {
  readonly providerMessageId: string;
}

export interface EmailSender {
  send(
    message: OutboundEmail,
    idempotencyKey: string,
  ): Promise<EmailDeliveryResult>;
}

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

type FetchLike = typeof fetch;

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly apiUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async send(
    message: OutboundEmail,
    idempotencyKey: string,
  ): Promise<EmailDeliveryResult> {
    // Workerd's native fetch rejects method-style invocation with a foreign receiver.
    const fetchImpl = this.fetchImpl;
    const response = await fetchImpl(`${this.apiUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      throw new EmailDeliveryError(
        `Email provider returned HTTP ${response.status}.`,
        response.status,
        "EMAIL_PROVIDER_REJECTED",
      );
    }

    const payload: unknown = await response.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !("id" in payload) ||
      typeof payload.id !== "string" ||
      !payload.id
    ) {
      throw new EmailDeliveryError(
        "Email provider returned an invalid response.",
        response.status,
        "EMAIL_PROVIDER_RESPONSE_INVALID",
      );
    }

    return { providerMessageId: payload.id };
  }
}

class UnavailableEmailSender implements EmailSender {
  async send(): Promise<never> {
    throw new EmailDeliveryError(
      "Email delivery is not configured.",
      undefined,
      "EMAIL_PROVIDER_NOT_CONFIGURED",
    );
  }
}

export function createEmailSender(env: AppEnv): EmailSender {
  if (!env.RESEND_API_KEY || !env.CONTACT_FROM_EMAIL) {
    return new UnavailableEmailSender();
  }
  return new ResendEmailSender(
    env.RESEND_API_KEY,
    `PreconFin <${env.CONTACT_FROM_EMAIL}>`,
    env.RESEND_API_URL,
  );
}
