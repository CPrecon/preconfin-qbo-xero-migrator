# Production Readiness Audit

Audit date: 2026-07-12
Baseline commit: 1d94134 feat: scaffold qbo xero migrator
Scope: production paths in apps/web, apps/api, packages, infrastructure, and docs.

## Summary

The scaffold had the correct product shape and a working read-only QBO to Xero file-generation path, but several V1 production requirements were incomplete. This pass focused on hardening the existing path rather than adding broad new product areas.

## Confirmed strengths

- QBO OAuth requested accounting access only and the product does not write to QuickBooks or Xero.
- OAuth state was signed, stored server-side, expired, and consumed once.
- Intuit tokens were encrypted before persistence.
- Migration jobs and downloads used per-job tokens instead of anonymous artifact URLs.
- Raw QBO snapshots were not returned to browser responses.
- Supabase RLS was enabled with no anonymous policies for sensitive tables.

## Confirmed gaps before this pass

- OAuth did not use PKCE.
- Disconnect removed only the local connection; it did not revoke the Intuit refresh token.
- QBO minor version was hardcoded in request URLs.
- QBO retry behavior did not respect Retry-After and errors could include raw response bodies.
- AR aging, AP aging, and tax code extraction were missing.
- Validation findings lacked affected source records and an explicit blocks-export flag.
- Validation did not cover all required V1 integrity checks, including AR/AP agreement, payment allocations, duplicate document numbers, mapping uniqueness, tracking limits, and opening balance readiness.
- Xero CSV files used canonical IDs in some account/contact fields instead of mapped Xero-facing values.
- Credit note export was missing.
- The generated package did not clearly separate import-ready, manual-configuration, reference-only, unsupported, and excluded records.
- Artifact paths were scoped by job UUID but lacked a random path nonce.
- Deleting a job removed database rows but did not remove storage objects.
- The web wizard stored job and connection tokens in localStorage and left OAuth return tokens in the URL.
- PostHog was initialized but the required funnel events were not instrumented.
- Automated coverage did not include PKCE, OAuth failure paths, QBO request coverage, CSV schemas, PDF generation, or artifact-related behavior.

## Fixes implemented in this pass

- Added PKCE S256 OAuth verifier/challenge generation and server-side verifier storage.
- Added Intuit token revocation on disconnect with local disconnect still proceeding if revocation fails.
- Added configurable QBO minor version, artifact retention, and signed URL TTL settings.
- Expanded QBO extraction to TaxCode, AgedReceivables, and AgedPayables.
- Added structured QBO and Intuit OAuth error types and removed raw response-body leakage from public errors.
- Added Retry-After handling for retryable QBO responses.
- Added richer validation finding metadata: stable code, explanation, affected records, remediation, and blocksExport.
- Added deterministic validation for AR/AP agreement, payment allocation limits, credit totals, duplicate document numbers, reference integrity, Xero account-code uniqueness, tracking limits, inactive entity usage, tax mapping gaps, and opening balance readiness.
- Updated Xero exports to use mapped account codes and contact names.
- Added credit-notes export.
- Reorganized migration packages into import-ready, manual-configuration, reference-only, unsupported, and excluded folders.
- Added random artifact path nonces and storage deletion during job deletion.
- Switched wizard tokens to sessionStorage and stripped OAuth tokens from the callback URL after capture.
- Added privacy-safe PostHog funnel events without sending accounting values, contact details, OAuth data, transaction descriptions, or financial data.
- Added fixture-based regression tests for PKCE, QBO extraction shape, OAuth failure, CSV schemas, PDF generation, and validation behavior.

## Not proven in this session

- Live QBO sandbox OAuth and extraction were not run because Intuit sandbox credentials were not available in the environment.
- Xero import success was not live-validated. V1 is CSV-only, so compatibility is validated through schema fixtures and the live-sandbox checklist until a Xero demo organization is provided.
- Supabase storage deletion and signed URL behavior were code-reviewed and covered by API structure, but not executed against a real Supabase project in this session.
