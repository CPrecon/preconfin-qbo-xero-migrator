# Launch Readiness Report

## Current status

Fixture-based production readiness is materially stronger after this pass. The app is ready for environment configuration and live sandbox verification, but it should not be marketed as live-verified against a real QBO sandbox until the checklist in `docs/live-sandbox-verification.md` is completed.

## Verified through automated tests

- PKCE generation and OAuth state tamper rejection.
- Invalid OAuth callback state failure path.
- QBO request coverage for required sources, configurable minor version, and sanitized integration errors.
- Canonical to migration plan to validation flow.
- Validation findings with blocking status and affected source records.
- Xero CSV schema regression for core export files.
- PDF report generation.
- ZIP package generation.

## Verified by code review

- Read-only QBO extraction path.
- Token encryption before persistence.
- Session-only browser token storage.
- OAuth callback URL cleanup.
- Signed URL generation behind job-token checks.
- Storage object deletion path on scan deletion.
- Privacy-safe analytics allowlist.

## Requires live sandbox verification

- Real Intuit OAuth connection.
- Complete extraction from a QBO sandbox company.
- Token refresh and revocation behavior.
- Supabase signed URL expiry and storage cleanup.
- Cross-job/tenant access attempts against the deployed API.
- Xero demo import compatibility.

## Launch recommendation

Proceed to staging deployment only after environment variables, Supabase schema, and storage bucket are configured. Proceed to public launch only after live QBO sandbox verification and at least one Xero demo import test of generated files.
