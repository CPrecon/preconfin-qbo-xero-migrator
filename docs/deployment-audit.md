# Deployment Audit

Starting commit: `c7bd8dc75ee27f334d139f82f939a14e9c5f0d87`

## Findings

- `apps/web` is a Next.js application built for Cloudflare Workers through OpenNext.
- `apps/web/open-next.config.ts` is minimal and compatible with the current build.
- `apps/web/wrangler.jsonc` existed, but only contained one production-looking URL and no staging/production environment split.
- `apps/api` keeps a Fastify server for Node/local API docs, but Cloudflare runs the direct fetch router at `apps/api/src/worker.ts`.
- `apps/api/wrangler.toml` existed, but did not define staging/production URLs, routes, or observability.
- The direct API Worker compiles to `apps/api/dist/worker.js` through the existing TypeScript build.
- OAuth callback routes live under `/api/oauth/qbo/*`, so the API Worker must receive `/api/*` traffic.
- Artifact generation is API-side and depends on Supabase PostgreSQL and Supabase Storage.
- PDF and ZIP generation stay in the API Worker path and must be validated with local Worker and staging Worker smoke tests.
- The web app previously defaulted the browser API URL to `http://localhost:4000`, which is unsafe for production builds if not overridden.
- `NEXT_PUBLIC_*` values must be provided during OpenNext build because they are visible in the client bundle.

## Architecture decision

Use two Cloudflare Workers:

1. `preconfin-qbo-xero-migrator-web-*` for the OpenNext web application.
2. `preconfin-qbo-xero-migrator-api-*` for the API Worker.

Staging can use `/api/*` route specificity on `migrate-staging.preconfin.com`. Production uses separate Worker Custom Domains: `migrate.preconfin.com` for the web Worker and `api-migrate.preconfin.com` for the API Worker. This keeps OAuth callbacks, artifact generation, and Supabase access isolated from the client bundle while allowing explicit CORS control between the two production origins. The Worker router reuses the same repository, OAuth, migration, validation, PDF, ZIP, and Supabase service modules as the Node API path.

A single full-stack Worker was not chosen because integrating the existing Fastify API into Next route handlers would be a broader product refactor and would increase launch risk. A static Pages deployment was not chosen because OAuth, migration jobs, signed artifact URLs, and lead capture require server runtime behavior.

## Required routes

Staging:

```text
migrate-staging.preconfin.com/api/* -> API Worker
migrate-staging.preconfin.com/* -> Web Worker
```

Production:

```text
api-migrate.preconfin.com -> API Worker custom domain
migrate.preconfin.com -> Web Worker custom domain
```

## Health checks

- Web: `/health`
- API: `/api/health` when routed through Cloudflare, `/health` when calling the API Worker directly.

## Blockers before production

- No Cloudflare deployment was executed unless credentials are present and staging is explicitly deployed.
- Live QBO sandbox OAuth/extraction remains unverified.
- Supabase artifact lifecycle remains unverified against staging infrastructure.
- Xero import and reconciliation remain unverified.
- Production custom domain and production Intuit credentials must not be enabled until live certification gates pass.
