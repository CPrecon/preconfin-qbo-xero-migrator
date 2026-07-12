# Deployment Guide

## Targets

- Web: Cloudflare Pages
- API: Cloudflare Worker adapter for Fastify with `nodejs_compat`, or a Node runtime using the included Dockerfile where Worker compatibility is not available for PDF/ZIP generation.
- Database and storage: Supabase PostgreSQL and Supabase Storage

## Required Secrets

- `INTUIT_CLIENT_ID`
- `INTUIT_CLIENT_SECRET`
- `INTUIT_REDIRECT_URI`
- `TOKEN_ENCRYPTION_KEY`
- `OAUTH_STATE_SIGNING_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `POSTHOG_KEY`

## Database

Apply `infrastructure/supabase/migrations/0001_initial.sql` in Supabase SQL editor or through your migration runner.

Create a private Supabase Storage bucket named `migration-artifacts`.

## Cloudflare Pages

The web workflow builds `apps/web` and deploys the generated Cloudflare Pages output. Configure `PUBLIC_API_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, and `NEXT_PUBLIC_POSTHOG_HOST` in the Pages environment.

## API Deployment

`apps/api` exposes both a Node server entrypoint and a Worker fetch adapter. If your Cloudflare account supports the required Node compatibility for PDF and ZIP dependencies, deploy with `apps/api/wrangler.toml`. Otherwise deploy the API Docker image to a Node-compatible runtime and keep the web app on Cloudflare Pages.
