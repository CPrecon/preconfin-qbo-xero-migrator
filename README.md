# PreconFin QBO → Xero Migrator

A standalone PreconFin-branded migration utility for connecting QuickBooks Online, analyzing accounting data, exporting Xero-ready CSV files, and producing a branded migration validation report.

This repository is intentionally independent from the core PreconFin application. It shares brand direction, analytics conventions, and secure OAuth patterns, but it has its own web app, API, database schema, storage, and deployment pipeline.

## Applications

- `apps/web` — Next.js public website, migration wizard, dashboard, and static legal pages.
- `apps/api` — Fastify API for Intuit OAuth, QBO ingestion, migration jobs, exports, reports, downloads, and lead capture.

## Packages

- `packages/canonical-model` — canonical accounting types and QBO normalization.
- `packages/migration-engine` — QBO-to-Xero mapping and exception detection.
- `packages/financial-assessment-engine` — canonical deterministic controls, findings, classification, scoring, status, recommendations, evidence, and immutable FinancialAssessmentV1 contract.
- `packages/validation-engine` — temporary compatibility projection for existing PDF and ZIP renderers; it does not own rules or scoring.
- `packages/xero-export` — Xero-compatible CSV and ZIP generation.
- `packages/pdf-report` — branded Migration Health PDF generation.
- `packages/shared-ui` — PreconFin-branded UI primitives used by the web app.

## Local Development

1. Copy `.env.example` to `.env` and fill in Intuit and Supabase credentials.
2. Install dependencies: `npm install`.
3. Apply the database schema in `infrastructure/supabase/migrations/0001_initial.sql`.
4. Start the API: `npm run dev:api`.
5. Start the web app: `npm run dev:web`.

## Validation

```bash
npm run typecheck
npm run test
npm run test:contract
npm run build
```

## Security Model

- QuickBooks access is read-only.
- OAuth states are signed and stored server-side.
- Intuit access and refresh tokens are encrypted before persistence.
- Migration artifacts are stored in Supabase Storage and served through signed URLs.
- No PreconFin account is required for a migration scan.

See `docs/` for deployment, administration, API, and Linear project details.
