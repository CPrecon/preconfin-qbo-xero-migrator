# Marketing Site Integration Plan

The existing PreconFin marketing repository was inspected read-only at /home/ubuntu/precon/Preconfin_website. No files were modified.

## Recommended public surfaces

1. `https://preconfin.com/tools/quickbooks-to-xero`
   - SEO landing page inside the main marketing site.
   - Canonical page for search demand around QuickBooks to Xero migration.
   - Primary CTA routes to `https://migrate.preconfin.com`.

2. `https://migrate.preconfin.com`
   - Standalone migrator application in this repository.
   - Own OAuth redirect URL and deployment pipeline.
   - Canonical URL for the actual migration wizard.

## Existing marketing integration points

- The marketing site already has canonical metadata helpers in `lib/seo.ts`.
- The marketing site already has consent-aware PostHog helpers in `lib/analytics.ts`.
- The sitemap exists in `public/sitemap.xml` and app-level routes exist for demo, contact, pricing, integrations, and resources.
- The site already uses Book a Demo and Contact flows that route to `/contact`.

## Required marketing changes in a future explicit task

- Add `/tools/quickbooks-to-xero` page with canonical URL `https://preconfin.com/tools/quickbooks-to-xero`.
- Add sitemap entry for `/tools/quickbooks-to-xero`.
- Add structured data: SoftwareApplication or WebApplication plus FAQPage if FAQs are included.
- Link from relevant resource pages and footer/resources area without making it part of the core PreconFin app navigation unless desired.
- Ensure pricing language remains consultation-led and does not introduce self-serve subscription positioning.
- Add cross-domain PostHog configuration so anonymous journeys can connect `preconfin.com` and `migrate.preconfin.com` after consent.

## OAuth redirect URLs

Configure Intuit app redirect URLs separately for each environment:

- Local: `http://localhost:4000/api/oauth/qbo/callback`
- Staging: `https://api-staging.migrate.preconfin.com/api/oauth/qbo/callback`
- Production: `https://api.migrate.preconfin.com/api/oauth/qbo/callback`

## CTA routing

- Marketing tool page primary CTA: `Start migration scan` -> `https://migrate.preconfin.com/migrate`.
- Marketing consultation CTA: `Book a Demo` or `Talk to PreconFin` -> `https://preconfin.com/contact`.
- Migrator lead form remains in the standalone app and posts to the migrator API.
