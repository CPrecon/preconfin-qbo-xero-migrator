# Marketing Repository Handoff: QuickBooks to Xero Tool

Do not modify the PreconFin marketing repository until this handoff is approved. This standalone migrator repository owns `https://migrate.preconfin.com`; the marketing repository should own the canonical SEO page at `https://preconfin.com/tools/quickbooks-to-xero`.

## Route

```text
/tools/quickbooks-to-xero
```

Canonical URL:

```text
https://preconfin.com/tools/quickbooks-to-xero
```

Primary converter CTA:

```text
https://migrate.preconfin.com/migrate?utm_source=preconfin&utm_medium=tool_page&utm_campaign=qbo_xero_migrator
```

Staging CTA for review:

```text
https://migrate-staging.preconfin.com/migrate?utm_source=preconfin&utm_medium=tool_page&utm_campaign=qbo_xero_migrator
```

## Page objective

The page should rank for QuickBooks Online to Xero migration searches and move qualified visitors into the standalone converter. It should feel like part of the PreconFin product family without turning the core PreconFin site into a migration tool UI.

## Title and meta description

Title:

```text
QuickBooks Online to Xero Migration Tool | PreconFin
```

Meta description:

```text
Connect QuickBooks Online, check migration readiness, and generate Xero-ready CSV files with a branded validation report from PreconFin.
```

## Target search terms

- QuickBooks Online to Xero migration
- QBO to Xero converter
- QuickBooks to Xero migration tool
- Xero-ready QuickBooks export
- QuickBooks Online migration validation
- migrate invoices from QuickBooks to Xero
- migrate chart of accounts from QuickBooks to Xero

## Recommended page outline

1. Hero
   - Headline: `Move from QuickBooks Online to Xero with confidence.`
   - Copy: Explain read-only QBO connection, readiness scan, Xero-ready files, validation report.
   - Primary CTA: `Start migration scan` to `https://migrate.preconfin.com/migrate?...`
   - Secondary CTA: `See supported data` anchor.

2. How it works
   - Connect QuickBooks Online with read-only access.
   - Review migration readiness and exceptions.
   - Download Xero-ready CSV files and a branded report.

3. Supported data table
   - Company information
   - Chart of accounts
   - Customers
   - Vendors
   - Items
   - Invoices
   - Bills
   - Payments
   - Credit notes
   - Journal entries
   - Trial balance
   - Profit and loss
   - Balance sheet

4. Example report section
   - Show a sanitized sample report image or link to a sanitized sample artifact.
   - Explain readiness score, warnings, blocking issues, recommendations.

5. Security section
   - Read-only Intuit OAuth.
   - No writes to QuickBooks or Xero in Version 1.
   - Encrypted token storage.
   - Private artifacts with expiring signed URLs.
   - User can delete migration scans.

6. Migration limitations
   - Version 1 creates files, it does not write directly to Xero.
   - Some system accounts, opening balances, tax codes, inventory, payroll, attachments, and historical payment allocations may require manual review.
   - Users should test imports in a Xero demo organisation before production.

7. FAQ
   - Does it write to QuickBooks or Xero? No.
   - Do I need a PreconFin account? No.
   - What files do I receive? CSV package, mapping report, exceptions, README, validation JSON, PDF report.
   - What should I review before importing? Tax mapping, system accounts, opening balances, AR/AP, bank balances, unsupported records.
   - Is this a replacement for an accountant? No. It is a structured readiness and export tool.

8. Final CTA
   - `Start migration scan` to the converter.
   - `Talk to PreconFin` to `/contact`.

## Structured data

Add `WebApplication` or `SoftwareApplication` JSON-LD for the tool page. Include:

```text
name: QuickBooks Online to Xero Migration Tool
applicationCategory: BusinessApplication
operatingSystem: Web
provider: PreconFin
url: https://preconfin.com/tools/quickbooks-to-xero
```

Add `FAQPage` JSON-LD if the FAQ section is present. Keep FAQ answers consistent with page copy.

## CTA and attribution

Every converter CTA should include safe campaign parameters. Do not include user identifiers, email addresses, account names, balances, or transaction data.

Recommended query parameters:

```text
utm_source=preconfin
utm_medium=tool_page
utm_campaign=qbo_xero_migrator
```

The standalone app retains these values in session storage and forwards sanitized attribution to PreconFin CTAs.

## Sitemap and robots

Add this page to the marketing repository sitemap:

```text
https://preconfin.com/tools/quickbooks-to-xero
```

The standalone converter sitemap intentionally does not include `/migrate`, `/dashboard`, callback, result, or download routes.

## Navigation placement

Recommended placements:

- Resources or Tools section.
- Relevant integration pages for QuickBooks, Xero, accounting, and finance operations.
- Blog/resource articles about migration readiness.

Do not add the converter to primary PreconFin product navigation until the live certification gates are complete.

## Search Console checklist

1. Deploy the marketing route.
2. Confirm canonical tag points to `https://preconfin.com/tools/quickbooks-to-xero`.
3. Confirm JSON-LD validates.
4. Confirm sitemap includes the page.
5. Submit the URL in Search Console.
6. Inspect mobile usability.
7. Confirm CTA links include UTM parameters and resolve to the converter.
8. Confirm the converter itself canonicalizes back to the marketing page where appropriate.

## OAuth redirect URLs

The converter app owns OAuth. Configure Intuit redirect URLs in Intuit, not in the marketing repo:

```text
https://migrate-staging.preconfin.com/api/oauth/qbo/callback
https://api-migrate.preconfin.com/api/oauth/qbo/callback
```

## Analytics boundary

The marketing site may pass UTM/referral parameters to the converter. The converter must not send accounting values, balances, contact details, transaction descriptions, tokens, CSV contents, or report contents to PostHog.
