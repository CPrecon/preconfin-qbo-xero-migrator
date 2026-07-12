# Linear Project: PRE-MIG-1 QBO to Xero Migration Tool

## Goal

Build a production-ready public web application that securely connects QuickBooks Online, analyzes accounting data, generates Xero-ready migration files, and produces a branded financial validation report.

## Current production-readiness status

The scaffold has been hardened for V1 fixture-based readiness. Live QBO sandbox verification is still required before public launch.

## Epic 1: OAuth and QBO Extraction

- PRE-MIG-101: Configure Intuit sandbox and production apps with exact redirect URLs.
- PRE-MIG-102: Verify PKCE OAuth start and callback against a real QBO sandbox company.
- PRE-MIG-103: Verify refresh-token rotation and expired-token recovery.
- PRE-MIG-104: Verify disconnect revokes the Intuit token.
- PRE-MIG-105: Verify extraction coverage for company, accounts, customers, vendors, items, invoices, bills, payments, credit memos, vendor credits, journals, classes, departments, tax data, currencies, trial balance, balance sheet, profit and loss, AR aging, and AP aging.

## Epic 2: Canonical Accounting and Validation

- PRE-MIG-201: Review canonical model output against a live QBO sandbox data set.
- PRE-MIG-202: Verify AR/AP agreement with QBO aging reports.
- PRE-MIG-203: Verify payment allocation and credit-note findings with fixture and sandbox cases.
- PRE-MIG-204: Review Xero account-code, tax-code, and tracking constraints with an accountant.
- PRE-MIG-205: Add accountant-approved remediation copy for top validation findings.

## Epic 3: Xero CSV Export

- PRE-MIG-301: Run generated chart of accounts CSV through Xero demo import.
- PRE-MIG-302: Run contacts, items, invoices, bills, and credit notes through Xero demo import.
- PRE-MIG-303: Validate manual journals, bank statement files, and opening balances with accountant review.
- PRE-MIG-304: Expand fixture coverage for regional tax-code examples.
- PRE-MIG-305: Document unsupported records that require assisted migration.

## Epic 4: Artifact Security

- PRE-MIG-401: Verify private Supabase Storage bucket policy.
- PRE-MIG-402: Verify signed URL expiration in staging.
- PRE-MIG-403: Verify deletion removes database and storage artifacts.
- PRE-MIG-404: Add deployed cross-job access test with two generated jobs.
- PRE-MIG-405: Configure artifact cleanup job for expired artifacts.

## Epic 5: User Experience and Funnel

- PRE-MIG-501: Browser QA landing, migrate, dashboard, contact, pricing, privacy, and terms on desktop, tablet, and mobile.
- PRE-MIG-502: Verify no horizontal overflow and no console errors.
- PRE-MIG-503: Verify retryable and unrecoverable failure messages with staged API responses.
- PRE-MIG-504: Confirm PostHog funnel events arrive without financial or OAuth data.
- PRE-MIG-505: Confirm lead submission routes into the PreconFin follow-up process.

## Epic 6: Marketing Integration

- PRE-MIG-601: Add main-site SEO page at `/tools/quickbooks-to-xero` after integration boundary approval.
- PRE-MIG-602: Add sitemap and structured data for the tool page.
- PRE-MIG-603: Configure cross-domain analytics between preconfin.com and migrate.preconfin.com.
- PRE-MIG-604: Verify canonical URLs and OAuth redirect URLs for staging and production.
- PRE-MIG-605: Keep pricing and subscription language out of the main PreconFin sales flow.

## Epic 7: Launch Readiness

- PRE-MIG-701: Complete the live sandbox checklist in `docs/live-sandbox-verification.md`.
- PRE-MIG-702: Complete staging deployment smoke test.
- PRE-MIG-703: Complete dependency audit review after the next compatible Next.js release.
- PRE-MIG-704: Prepare support runbook and admin artifact-retention process.
- PRE-MIG-705: Approve public launch after live QBO and Xero demo verification.
