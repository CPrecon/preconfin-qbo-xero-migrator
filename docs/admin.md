# Administrator Guide

## Operational Responsibilities

- Rotate `TOKEN_ENCRYPTION_KEY` with a planned token re-authentication window.
- Monitor Intuit API quota and failed refresh attempts.
- Review validation failure rates weekly to improve recommendations.
- Set Supabase artifact retention according to privacy commitments.
- Audit lead capture exports and PostHog funnels monthly.
- Review `migration_leads` rows with an `admin_email_status` or
  `confirmation_email_status` of `failed`; the lead is already durable and can
  be followed up without asking the visitor to submit again.
- Monitor `lead_email_delivery_failed` diagnostics by failure code. Logs contain
  the lead ID and delivery kind, but not the submitter address or message body.

## Contact Delivery

Contact submissions are persisted before either email is attempted. The API
then sends one admin notification and one submitter confirmation with separate
idempotency keys and records each provider message ID or sanitized failure
code. A successful API response means the lead was stored; its `notifications`
object states whether each email was sent or failed.

Production requires `RESEND_API_KEY`, `CONTACT_ADMIN_EMAIL`, and
`CONTACT_FROM_EMAIL`. Apply
`infrastructure/supabase/migrations/0002_lead_email_delivery.sql` before the
corresponding API release. If delivery fails, use the persisted lead row for
follow-up and investigate the provider status before retrying with the same
lead-specific idempotency key.

## Artifact Retention

Migration ZIPs and PDFs should be deleted automatically after the configured retention window. The default database column is `expires_at`; schedule cleanup through Supabase cron or an API maintenance job.

## Support Workflow

1. Ask the user for their migration job ID.
2. Confirm job status and validation score in `migration_jobs`.
3. Review `migration_artifacts` signed URL status.
4. Never request or expose raw Intuit tokens.
