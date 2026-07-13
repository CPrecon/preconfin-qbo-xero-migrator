# Live Certification Operator Runbook

Status: ready for operator execution; not executed in this session.
Starting commit: e0e7058413876dfa0fd1dd41a732ff7c9676dfad

## 1. Prepare staging

1. Configure the environment from `docs/live-verification/environment-setup-checklist.md`.
2. Set `LIVE_CERTIFICATION_MODE=true`.
3. Run:

```bash
npm run verify:env:live
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
npm run pages:build -w apps/web
```

Do not continue until all commands pass.

## 2. Deploy staging only

Deploy to staging infrastructure only. Do not deploy production during certification.

- Web: `migrate-staging.preconfin.com`
- API: `api-staging.migrate.preconfin.com`
- Supabase: dedicated staging project
- Storage bucket: private staging bucket

## 3. Intuit sandbox certification

1. Open `/migrate` on the staging web app.
2. Click `Connect QuickBooks Online`.
3. Complete Intuit sandbox OAuth.
4. Confirm callback returns to the wizard and the URL is cleaned.
5. Create and run a migration job.
6. Record endpoint statuses and entity counts in `intuit-sandbox-results.md`.
7. Force an access-token refresh by using an expired or near-expired access token.
8. Disconnect and verify Intuit token revocation behavior.
9. Reconnect and rerun extraction to verify idempotent repeated runs.

Capture only aggregated counts and controls.

## 4. Supabase security certification

1. Apply migrations from an empty database.
2. Confirm RLS is enabled and no anonymous policies expose sensitive tables.
3. Run two separate migration jobs using separate job tokens.
4. Attempt cross-job reads and downloads.
5. Confirm unauthorized access is denied.
6. Confirm signed URLs expire.
7. Delete one migration and verify database rows and storage objects are removed.
8. Simulate a storage deletion failure, rerun cleanup, and document recovery.
9. Inspect logs for token and accounting-data leakage.

Record results in `supabase-security-results.md`.

## 5. Xero import certification

1. Use the verified QBO migration package.
2. Import each generated file into a disposable Xero organisation.
3. Record accepted and rejected rows in `xero-import-results.md`.
4. Do not hide rejected rows. Classify each rejection as product-wide, source-data-specific, or expected manual step.
5. If a product defect is found, fix only that defect and add a regression test.

## 6. Reconciliation

1. Compare QBO source controls to Xero destination controls.
2. Populate `reconciliation-results.md` and `reconciliation-result.template.json` copied to a dated result file.
3. Every difference must be zero, corrected, or explicitly explained as a supported manual step or unsupported limitation.

## 7. Completion gate

The product is not production-ready until these are all true:

- Real QBO sandbox OAuth and extraction completed.
- Real Supabase artifact lifecycle and tenant isolation completed.
- Xero accepted generated files or every rejection has a documented remediation.
- Financial reconciliation differences are zero, corrected, or classified.
- All automated validations pass after any product correction.
