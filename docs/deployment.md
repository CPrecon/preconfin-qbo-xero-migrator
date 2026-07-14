# Cloudflare Workers Deployment Guide

This repository deploys the QBO to Xero Migrator as a standalone PreconFin acquisition tool. It remains separate from the PreconFin marketing repository.

## Deployment architecture

Use two Cloudflare Workers with separate production frontend and API domains.

| Surface | Worker                                    | Route                                 | Purpose                                                       |
| ------- | ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| Web app | `preconfin-qbo-xero-migrator-web-staging` | `migrate-staging.preconfin.com/*`     | OpenNext/Next.js UI, SEO pages, wizard, static assets         |
| API     | `preconfin-qbo-xero-migrator-api-staging` | `migrate-staging.preconfin.com/api/*` | Direct Worker API router, OAuth, extraction, artifacts, leads |
| Web app | `preconfin-qbo-xero-migrator-web`         | `migrate.preconfin.com`               | Production converter UI                                       |
| API     | `preconfin-qbo-xero-migrator-api`         | `api-migrate.preconfin.com`           | Production API                                                |

Production uses Worker Custom Domains for both public converter surfaces. Browser API calls target `https://api-migrate.preconfin.com`; API CORS must allow only `https://migrate.preconfin.com` plus any explicitly approved staging/local origins.

The SEO landing page is not in this repository. It should live at `https://preconfin.com/tools/quickbooks-to-xero` in the marketing repository.

## Current config files

- Web Worker: `apps/web/wrangler.jsonc`
- API Worker: `apps/api/wrangler.jsonc`
- OpenNext config: `apps/web/open-next.config.ts`
- Deploy workflow: `.github/workflows/deploy-cloudflare.yml`

## Required Cloudflare setup

1. Confirm the Cloudflare account has the `preconfin.com` zone.
2. Create API tokens with permission to deploy Workers and edit Workers routes.
3. Add DNS records for staging and production domains. Use proxied records.
4. Do not attach `migrate.preconfin.com` until staging is certified.

Expected custom domains:

```text
migrate-staging.preconfin.com
migrate.preconfin.com
api-migrate.preconfin.com
```

## Runtime variables

Committed Wrangler config contains only non-secret environment variables. Secrets must be set through Cloudflare Workers secrets or GitHub Actions secrets.

### API secrets per environment

Set these on `preconfin-qbo-xero-migrator-api-staging` and later on `preconfin-qbo-xero-migrator-api`:

```bash
cd apps/api
wrangler secret put INTUIT_CLIENT_ID --env staging
wrangler secret put INTUIT_CLIENT_SECRET --env staging
wrangler secret put INTUIT_REDIRECT_URI --env staging
wrangler secret put TOKEN_ENCRYPTION_KEY --env staging
wrangler secret put OAUTH_STATE_SIGNING_SECRET --env staging
wrangler secret put SUPABASE_URL --env staging
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
wrangler secret put POSTHOG_KEY --env staging
```

Use the same names with `--env production` only after staging certification.

Expected staging values by name, without secret values:

```text
PUBLIC_APP_URL=https://migrate-staging.preconfin.com
PUBLIC_API_URL=https://migrate-staging.preconfin.com
INTUIT_REDIRECT_URI=https://migrate-staging.preconfin.com/api/oauth/qbo/callback
INTUIT_ENVIRONMENT=sandbox
SUPABASE_STORAGE_BUCKET=migration-artifacts-staging
```

Expected production values by name, without secret values:

```text
PUBLIC_APP_URL=https://migrate.preconfin.com
PUBLIC_API_URL=https://api-migrate.preconfin.com
CORS_ORIGINS=https://migrate.preconfin.com
INTUIT_REDIRECT_URI=https://api-migrate.preconfin.com/api/oauth/qbo/callback
INTUIT_ENVIRONMENT=production
SUPABASE_STORAGE_BUCKET=migration-artifacts-production
```

### Web build variables

`NEXT_PUBLIC_*` values are build-time inputs for the client bundle. Use the environment-specific scripts instead of the generic build when deploying:

```bash
npm run pages:build:staging -w apps/web
npm run pages:build:production -w apps/web
```

Production frontend build values:

```text
NEXT_PUBLIC_APP_URL=https://migrate.preconfin.com
NEXT_PUBLIC_API_URL=https://api-migrate.preconfin.com
NEXT_PUBLIC_MARKETING_URL=https://preconfin.com
NEXT_PUBLIC_MARKETING_TOOL_URL=https://preconfin.com/tools/quickbooks-to-xero
NEXT_PUBLIC_PRIVACY_URL=https://migrate.preconfin.com/privacy
NEXT_PUBLIC_TERMS_URL=https://migrate.preconfin.com/terms
NEXT_PUBLIC_SUPPORT_URL=https://preconfin.com/contact
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

If PostHog is enabled, provide `NEXT_PUBLIC_POSTHOG_KEY` at build time. Do not include it in committed files.

## Supabase staging setup

1. Create a dedicated staging Supabase project.
2. Apply database migrations from an empty database.
3. Create a private Storage bucket named `migration-artifacts-staging`.
4. Confirm generated object paths include the migration job and artifact nonce.
5. Confirm signed URLs expire.
6. Confirm deletion removes database rows and storage objects.
7. Confirm service-role keys are stored only as Cloudflare Worker secrets.

## Intuit setup

Configure an Intuit developer app for staging with this redirect URL:

```text
https://migrate-staging.preconfin.com/api/oauth/qbo/callback
```

Use sandbox credentials only for staging. Production Intuit credentials must not be enabled until live certification is complete.

## PostHog setup

Create a staging project or staging environment. The app sends only allowlisted funnel properties. Do not add accounting values, contact details, transaction descriptions, tokens, CSV contents, or balances to analytics events.

## Local validation

```bash
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
npm run pages:build:staging -w apps/web
npm run build -w apps/api
npm run deploy:dry-run -w apps/api
npm run deploy:dry-run -w apps/web
```

`wrangler secret list` is useful for diagnostics, but it is not the production deployment gate. Cloudflare Worker secrets and encrypted dashboard variables are validated at Worker runtime. After deploying the API Worker, validate the actual runtime bindings through the live health route:

```bash
npm run verify:env:live -w apps/api -- --runtime-url=https://api-migrate.preconfin.com
```

The runtime health response must report `readiness.environment=configured` and `readiness.oauthRedirectUriMatchesExpected=true`. It returns required binding names and non-secret public configuration only; it must not return secret values.

## Local Worker smoke test

Web Worker:

```bash
cd apps/web
npm run pages:build:staging
wrangler dev --local --port 8787
curl -i http://127.0.0.1:8787/health
curl -i http://127.0.0.1:8787/robots.txt
```

API Worker with disposable local values:

```bash
cd apps/api
npm run build
PUBLIC_APP_URL=http://127.0.0.1:8787 \
PUBLIC_API_URL=http://127.0.0.1:8788 \
CORS_ORIGINS=http://127.0.0.1:8787 \
INTUIT_CLIENT_ID=local-intuit-client \
INTUIT_CLIENT_SECRET=local-intuit-secret \
INTUIT_REDIRECT_URI=http://127.0.0.1:8788/api/oauth/qbo/callback \
TOKEN_ENCRYPTION_KEY=<32-byte-base64-key> \
OAUTH_STATE_SIGNING_SECRET=<random-32-byte-string> \
SUPABASE_URL=https://example.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<local-placeholder-service-key> \
wrangler dev --local --port 8788
```

Then verify:

```bash
curl -i http://127.0.0.1:8788/health
```

## Staging deployment

Do not deploy staging until secrets are configured.

```bash
npm run deploy:staging
```

Equivalent manual steps:

```bash
npm run build -w apps/api
npm run deploy:staging -w apps/api
npm run pages:build:staging -w apps/web
npm run deploy:staging -w apps/web
```

Expected checks after deployment:

```bash
curl -i https://migrate-staging.preconfin.com/health
curl -i https://migrate-staging.preconfin.com/api/health
curl -i https://migrate-staging.preconfin.com/robots.txt
curl -i https://migrate-staging.preconfin.com/sitemap.xml
```

## Production deployment

Production must wait for:

- Intuit sandbox OAuth and extraction evidence.
- Supabase artifact lifecycle evidence.
- Xero import certification evidence.
- Reconciliation evidence.
- Launch-readiness sign-off.

When approved, deploy the frontend with:

```bash
npm run pages:build:production -w apps/web
npm run deploy:production -w apps/web
```

Deploy the production API only after its secrets and `api-migrate.preconfin.com` custom domain are approved:

```bash
npm run build -w apps/api
npm run deploy:production -w apps/api
```

The root `npm run deploy:production` command deploys both Workers and should be reserved for coordinated full-stack releases.

## GitHub Actions

The Cloudflare deployment workflow is manual only. It accepts an `environment` input of `staging` or `production`. Required GitHub secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
NEXT_PUBLIC_POSTHOG_KEY
```

Worker runtime secrets are managed in Cloudflare with `wrangler secret put`, not committed to GitHub workflow files.

## Rollback

Use Cloudflare Workers versions from the dashboard or redeploy a known-good commit.

```bash
git checkout <known-good-commit>
npm ci
npm run deploy:staging
```

For production rollback, use the same command with `deploy:production` only after confirming the target commit and environment.

## Health verification

A healthy production deployment returns JSON from both routes:

```bash
curl -i https://migrate.preconfin.com/health
curl -i https://api-migrate.preconfin.com/api/health
```

Expected JSON bodies:

```json
{ "ok": true, "service": "qbo-xero-migrator-web" }
{ "ok": true, "service": "qbo-xero-migrator-api" }
```

The API health route validates the runtime environment because the API Worker initializes the Fastify app before serving requests. Missing secrets should fail clearly.

## Incident response

1. Disable the affected Worker route in Cloudflare if customer data or OAuth safety is at risk.
2. Revoke Intuit app credentials if token exposure is suspected.
3. Rotate `TOKEN_ENCRYPTION_KEY` only with a migration plan for existing encrypted tokens.
4. Rotate `OAUTH_STATE_SIGNING_SECRET` immediately if OAuth state signing is at risk.
5. Revoke Supabase service-role key and issue a new Worker secret if storage/database access is at risk.
6. Run artifact cleanup and verify storage deletion.
7. Document the incident in `docs/live-verification/` or the incident tracker without secrets or private accounting data.
