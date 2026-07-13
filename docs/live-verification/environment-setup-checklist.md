# Live Certification Staging Setup Checklist

Status: not executed in this session. No live credentials were available locally.
Starting commit: e0e7058413876dfa0fd1dd41a732ff7c9676dfad

## Required domains

- Web app: `https://migrate-staging.preconfin.com`
- API: `https://api-staging.migrate.preconfin.com`
- Intuit callback: `https://api-staging.migrate.preconfin.com/api/oauth/qbo/callback`
- Marketing entry point: `https://preconfin.com/tools/quickbooks-to-xero`

## Environment validation

Run this before any live test:

```bash
npm run verify:env:live
```

The command requires `LIVE_CERTIFICATION_MODE=true` and validates staging-only settings without printing secret values.

## Intuit developer application

- Create or use a sandbox-mode Intuit developer app.
- Enable QuickBooks Online Accounting scope only.
- Add the staging callback URL exactly, including scheme and path.
- Configure:
  - `INTUIT_CLIENT_ID`
  - `INTUIT_CLIENT_SECRET`
  - `INTUIT_REDIRECT_URI`
  - `INTUIT_ENVIRONMENT=sandbox`
  - `QBO_MINOR_VERSION=75` or the selected supported minor version.

Reference: Intuit's OAuth guide documents the accounting scope, redirect URI, returned `realmId`, state validation, and refresh-token behavior.

## Intuit sandbox company

- Use a sandbox company with non-empty sample accounting data.
- Confirm it includes customers, vendors, invoices, bills, payments, credit memos, vendor credits, journals, tax data, classes or locations, and reports.
- Record only counts and financial controls in evidence. Do not commit transaction descriptions, tokens, contact details, or raw source payloads.

## Supabase project

- Create a dedicated staging project.
- Apply `infrastructure/supabase/migrations/0001_initial.sql` from an empty database.
- Create a private bucket named by `SUPABASE_STORAGE_BUCKET`, default `migration-artifacts`.
- Confirm RLS is enabled and no anonymous policies expose sensitive tables.
- Configure:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_STORAGE_BUCKET`
  - `ARTIFACT_RETENTION_DAYS`
  - `SIGNED_URL_TTL_SECONDS`

Reference: Supabase Storage signed URLs are generated server-side through the storage API and should expire; storage object deletion must be verified against the staging bucket.

## Xero test organisation

- Use a disposable Xero organisation.
- Do not use production Xero data.
- Configure certification-only references:
  - `XERO_CLIENT_ID`
  - `XERO_CLIENT_SECRET`
  - `XERO_TENANT_ID`
- V1 does not write to Xero through the API. These settings are used to identify and document the test organisation used during manual import certification.

## PostHog staging project

- Create a staging PostHog project.
- Configure:
  - `POSTHOG_KEY`
  - `POSTHOG_HOST`
- Confirm events contain only non-sensitive funnel metadata.

## Required environment keys

- `PUBLIC_APP_URL`
- `PUBLIC_API_URL`
- `CORS_ORIGINS`
- `INTUIT_CLIENT_ID`
- `INTUIT_CLIENT_SECRET`
- `INTUIT_REDIRECT_URI`
- `INTUIT_ENVIRONMENT`
- `QBO_MINOR_VERSION`
- `TOKEN_ENCRYPTION_KEY`
- `OAUTH_STATE_SIGNING_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `ARTIFACT_RETENTION_DAYS`
- `SIGNED_URL_TTL_SECONDS`
- `POSTHOG_KEY`
- `POSTHOG_HOST`
- `XERO_CLIENT_ID`
- `XERO_CLIENT_SECRET`
- `XERO_TENANT_ID`
- `LIVE_CERTIFICATION_MODE=true`
