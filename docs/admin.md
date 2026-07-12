# Administrator Guide

## Operational Responsibilities

- Rotate `TOKEN_ENCRYPTION_KEY` with a planned token re-authentication window.
- Monitor Intuit API quota and failed refresh attempts.
- Review validation failure rates weekly to improve recommendations.
- Set Supabase artifact retention according to privacy commitments.
- Audit lead capture exports and PostHog funnels monthly.

## Artifact Retention

Migration ZIPs and PDFs should be deleted automatically after the configured retention window. The default database column is `expires_at`; schedule cleanup through Supabase cron or an API maintenance job.

## Support Workflow

1. Ask the user for their migration job ID.
2. Confirm job status and validation score in `migration_jobs`.
3. Review `migration_artifacts` signed URL status.
4. Never request or expose raw Intuit tokens.
