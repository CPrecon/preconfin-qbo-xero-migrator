# Security and Privacy Review

## Data boundaries

- No PreconFin account is required for a scan.
- QBO OAuth uses read-only accounting scope.
- The tool generates Xero-ready files; it does not write to QuickBooks or Xero.
- Raw QBO snapshots are normalized server-side and are not returned in browser API responses.

## OAuth and token handling

- OAuth state is signed, stored server-side, expires after 10 minutes, and is consumed once.
- PKCE S256 is used for authorization code exchange.
- Intuit access and refresh tokens are encrypted before persistence.
- Disconnect attempts Intuit token revocation before local deletion.
- Expired access tokens are refreshed server-side when possible.
- Expired refresh tokens require reconnect.

## Artifact access

- Artifacts are stored in a private Supabase Storage bucket.
- Artifact paths include the job UUID plus a random nonce.
- Downloads require the job token before the API creates signed URLs.
- Signed URLs expire using SIGNED_URL_TTL_SECONDS.
- Deleting a scan removes the job and attempts to remove all associated storage objects.

## Browser handling

- The migration wizard stores connection and job tokens in sessionStorage, not localStorage.
- OAuth return tokens are removed from the URL after capture.
- The product does not expose raw source snapshots in client state.

## Logging and analytics

- Public errors are sanitized.
- QBO response bodies are not included in thrown integration errors.
- Audit events avoid lead email addresses and OAuth token data.
- PostHog events use a strict allowlist of non-sensitive properties.
- Do not send accounting values, contact details, OAuth data, transaction descriptions, source record names, or financial metadata to analytics.

## Remaining live checks

- Verify Supabase storage object deletion against a real project.
- Verify signed URL expiry against a real project.
- Verify cross-job token isolation against a real project.
- Verify Intuit revocation behavior with real sandbox tokens.
