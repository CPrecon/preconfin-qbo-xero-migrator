import { z } from "zod";
import type { AppEnv } from "../env.js";
import type { EmailSender } from "./email.js";
import { EmailDeliveryError } from "./email.js";

export const leadSubmissionSchema = z
  .object({
    email: z.string().trim().email().max(320),
    name: z.string().trim().min(1).max(120).optional(),
    company: z.string().trim().min(1).max(160).optional(),
    jobId: z.string().uuid().optional(),
    source: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default("migration-report"),
  })
  .strict();

export type LeadSubmission = z.infer<typeof leadSubmissionSchema>;
export type LeadEmailKind = "admin" | "confirmation";
export type LeadEmailStatus = "sent" | "failed";

export interface LeadRecord {
  readonly id: string;
}

export interface LeadDeliveryUpdate {
  readonly status: LeadEmailStatus;
  readonly attemptedAt: string;
  readonly providerMessageId?: string;
  readonly failureCode?: string;
}

export interface LeadRepository {
  saveLead(input: LeadSubmission): Promise<LeadRecord>;
  updateLeadDelivery(
    leadId: string,
    kind: LeadEmailKind,
    update: LeadDeliveryUpdate,
  ): Promise<void>;
  audit(event: string, payload: Record<string, unknown>): Promise<void>;
}

export interface LeadSubmissionResult {
  readonly ok: true;
  readonly persisted: true;
  readonly notifications: Readonly<{
    admin: LeadEmailStatus;
    confirmation: LeadEmailStatus;
  }>;
}

export type LeadDiagnosticLogger = (
  event: string,
  details: Record<string, unknown>,
) => void;

function safeEmailFailure(error: unknown): Record<string, unknown> {
  if (error instanceof EmailDeliveryError) {
    return {
      exceptionName: error.name,
      exceptionMessage: error.message,
      status: error.status,
      code: error.code,
      providerCode: error.providerCode,
    };
  }
  return {
    exceptionName: error instanceof Error ? error.name : "NonErrorThrown",
    exceptionMessage: "Email provider request failed.",
    code: "EMAIL_DELIVERY_FAILED",
  };
}

function deliveryFailureCode(error: unknown): string {
  return error instanceof EmailDeliveryError && error.code
    ? error.code
    : "EMAIL_DELIVERY_FAILED";
}

function adminMessage(input: LeadSubmission): string {
  return [
    "A new PreconFin migrator lead was submitted.",
    "",
    `Name: ${input.name ?? "Not provided"}`,
    `Email: ${input.email}`,
    `Company: ${input.company ?? "Not provided"}`,
    `Source: ${input.source}`,
    `Migration job: ${input.jobId ?? "Not linked"}`,
  ].join("\n");
}

function confirmationMessage(input: LeadSubmission): string {
  const greeting = input.name ? `Hi ${input.name},` : "Hello,";
  return [
    greeting,
    "",
    "We received your PreconFin request and saved it securely.",
    "",
    input.jobId
      ? "Your Financial Assessment and migration package remain available in the browser session where you submitted the request."
      : "A member of the PreconFin team will review your request and follow up with the appropriate next step.",
    "",
    "PreconFin",
  ].join("\n");
}

export class LeadService {
  constructor(
    private readonly env: AppEnv,
    private readonly repository: LeadRepository,
    private readonly emailSender: EmailSender,
    private readonly diagnosticLogger: LeadDiagnosticLogger = () => undefined,
  ) {}

  async submit(input: LeadSubmission): Promise<LeadSubmissionResult> {
    const lead = await this.repository.saveLead(input);
    await this.safeAudit("lead_captured", {
      leadId: lead.id,
      jobId: input.jobId,
      source: input.source,
    });

    const [admin, confirmation] = await Promise.all([
      this.deliver(
        lead.id,
        "admin",
        {
          to: this.env.CONTACT_ADMIN_EMAIL ?? "",
          subject: "New PreconFin contact submission",
          text: adminMessage(input),
          replyTo: input.email,
        },
        `lead-admin/${lead.id}`,
      ),
      this.deliver(
        lead.id,
        "confirmation",
        {
          to: input.email,
          subject: "We received your PreconFin request",
          text: confirmationMessage(input),
          replyTo: this.env.CONTACT_ADMIN_EMAIL,
        },
        `lead-confirmation/${lead.id}`,
      ),
    ]);

    await this.safeAudit("lead_submission_completed", {
      leadId: lead.id,
      jobId: input.jobId,
      source: input.source,
      adminEmailStatus: admin,
      confirmationEmailStatus: confirmation,
    });

    return {
      ok: true,
      persisted: true,
      notifications: { admin, confirmation },
    };
  }

  private async deliver(
    leadId: string,
    kind: LeadEmailKind,
    message: Parameters<EmailSender["send"]>[0],
    idempotencyKey: string,
  ): Promise<LeadEmailStatus> {
    const attemptedAt = new Date().toISOString();
    try {
      const delivery = await this.emailSender.send(message, idempotencyKey);
      await this.safeUpdate(leadId, kind, {
        status: "sent",
        attemptedAt,
        providerMessageId: delivery.providerMessageId,
      });
      return "sent";
    } catch (error) {
      const failureCode = deliveryFailureCode(error);
      await this.safeUpdate(leadId, kind, {
        status: "failed",
        attemptedAt,
        failureCode,
      });
      this.diagnosticLogger("lead_email_delivery_failed", {
        leadId,
        deliveryKind: kind,
        ...safeEmailFailure(error),
      });
      return "failed";
    }
  }

  private async safeUpdate(
    leadId: string,
    kind: LeadEmailKind,
    update: LeadDeliveryUpdate,
  ): Promise<void> {
    try {
      await this.repository.updateLeadDelivery(leadId, kind, update);
    } catch (error) {
      this.diagnosticLogger("lead_delivery_status_persistence_failed", {
        leadId,
        deliveryKind: kind,
        ...safeEmailFailure(error),
      });
    }
  }

  private async safeAudit(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.repository.audit(event, payload);
    } catch (error) {
      this.diagnosticLogger("lead_audit_persistence_failed", {
        event,
        leadId: payload.leadId,
        ...safeEmailFailure(error),
      });
    }
  }
}
