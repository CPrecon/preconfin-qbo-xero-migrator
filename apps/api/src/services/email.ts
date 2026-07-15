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
    readonly providerCode?: string,
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

type FetchLike = typeof fetch;

function sanitizedTransportMessage(
  error: unknown,
  sensitiveValues: readonly string[],
): string {
  let message = error instanceof Error ? error.message : "Unknown failure";
  for (const value of sensitiveValues) {
    if (value) message = message.replaceAll(value, "[redacted]");
  }
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/re_[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 240);
}

async function resendFailure(
  response: Response,
  sensitiveValues: readonly string[],
): Promise<{ providerCode?: string; message?: string }> {
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return {};
    const record = payload as { name?: unknown; message?: unknown };
    const providerCode =
      typeof record.name === "string" && /^[a-z0-9_]{1,80}$/.test(record.name)
        ? record.name
        : undefined;
    const message =
      typeof record.message === "string"
        ? sanitizedTransportMessage(new Error(record.message), sensitiveValues)
        : undefined;
    return { providerCode, message };
  } catch {
    return {};
  }
}

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
    let response: Response;
    try {
      response = await fetchImpl(`${this.apiUrl}/emails`, {
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
    } catch (error) {
      throw new EmailDeliveryError(
        `Email transport failed: ${sanitizedTransportMessage(error, [
          this.apiKey,
          this.from,
          message.to,
          message.replyTo ?? "",
        ])}`,
        undefined,
        "EMAIL_PROVIDER_UNREACHABLE",
      );
    }

    if (!response.ok) {
      const failure = await resendFailure(response, [
        this.apiKey,
        this.from,
        message.to,
        message.replyTo ?? "",
      ]);
      throw new EmailDeliveryError(
        `Email provider returned HTTP ${response.status}${
          failure.message ? `: ${failure.message}` : "."
        }`,
        response.status,
        "EMAIL_PROVIDER_REJECTED",
        failure.providerCode,
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
