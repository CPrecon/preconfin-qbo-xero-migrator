# Live Sandbox Verification Checklist

Do not mark these items complete unless they have been performed against real sandbox credentials.

## Required credentials

- Intuit developer application in sandbox mode.
- QuickBooks Online sandbox company with accounting data.
- Supabase project with the migration schema applied and private migration-artifacts bucket.
- Optional Xero demo organization for manual CSV import testing.

## QBO OAuth and extraction

- Start from /migrate and click Connect QuickBooks Online.
- Confirm Intuit OAuth prompts for read-only accounting access.
- Confirm callback succeeds and URL no longer contains connectionId or connectionToken after the wizard loads.
- Confirm a migration job can be created from the returned connection.
- Confirm extraction includes company information, accounts, customers, vendors, items, invoices, bills, payments, credit memos, vendor credits, journal entries, classes, departments, tax rates, tax codes, currencies, trial balance, balance sheet, profit and loss, AR aging, and AP aging.
- Confirm retry behavior handles a simulated 429 or 5xx response.
- Confirm expired access tokens refresh successfully.
- Confirm expired refresh tokens produce the reconnect message.
- Confirm disconnect revokes the Intuit token or logs a sanitized warning if Intuit revocation fails.

## Validation and artifacts

- Confirm validation report contains stable codes, affected records, remediation, and blocksExport.
- Confirm blocking errors prevent a ready status.
- Confirm warnings and info findings do not block export by themselves.
- Confirm generated ZIP contains import-ready, manual-configuration, reference-only, unsupported, and excluded folders.
- Confirm PDF report opens and displays PreconFin branding.
- Confirm signed URLs expire according to SIGNED_URL_TTL_SECONDS.
- Confirm deleting a scan removes database rows and storage objects.
- Confirm another job token cannot access the first job's downloads.

## Xero demo import

- Import chart of accounts into a Xero demo organization.
- Import contacts.
- Import items.
- Import invoices, bills, and credit notes.
- Review manual journals, bank statements, and opening balances with an accountant before import.
- Reconcile AR, AP, bank, retained earnings, and tax balances after import.

## UX and analytics

- Confirm desktop, tablet, and mobile layouts have no horizontal overflow.
- Confirm console has no runtime errors.
- Confirm PostHog receives funnel events without accounting values, contact details, OAuth data, or transaction descriptions.
- Confirm lead capture routes users into the PreconFin follow-up flow.
