# Xero CSV Compatibility Matrix

This matrix documents the V1 export intent. The generated package is designed for controlled review and Xero demo import testing before production use.

| Export                       | Package path                                      | Fixture status                       | Live certification status         | Notes                                                                                                                                                |
| ---------------------------- | ------------------------------------------------- | ------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chart of accounts            | import-ready/chart-of-accounts.csv                | Import-ready after review            | Not run                           | Contains migration-relevant accounts only. Deterministic mappings are automatic; ambiguous and explicit system-account treatments remain decisions.  |
| Contacts                     | import-ready/contacts.csv                         | Import-ready after review            | Not run                           | Consolidates customers and suppliers as contacts. Duplicate names are warnings because Xero may merge or reject duplicates depending on import path. |
| Items                        | import-ready/items.csv                            | Import-ready for non-inventory items | Not run                           | Inventory items are flagged as unsupported for V1 because Xero inventory setup may require manual configuration.                                     |
| Sales invoices               | import-ready/sales-invoices.csv                   | Import-ready after validation        | Not run                           | Uses contact names and mapped Xero account codes. Does not write payment allocation state directly to Xero.                                          |
| Bills                        | import-ready/bills.csv                            | Import-ready after validation        | Not run                           | Uses supplier contact names and mapped Xero account codes. Payment state requires manual review after import.                                        |
| Credit notes                 | import-ready/credit-notes.csv                     | Import-ready after validation        | Not run                           | Separates customer and supplier credits by Type field. Allocation history may require manual reconciliation.                                         |
| Manual journals              | manual-configuration/manual-journals.csv          | Manual configuration                 | Not run                           | Generated only from balanced journals. Review tax and account mapping before import.                                                                 |
| Bank statements              | manual-configuration/bank-statements.csv          | Manual configuration                 | Not run                           | Payment-derived bank rows are reference-ready, not a substitute for bank-feed reconciliation.                                                        |
| Opening balances             | manual-configuration/opening-balances.csv         | Manual configuration                 | Not run                           | Derived from trial-balance rows. Retained earnings, AR, AP, bank, and tax balances must be reconciled before use.                                    |
| Mapping report               | reference-only/mapping-report.csv                 | Reference-only                       | Not applicable                    | Shows generated account, tax, contact, item, and tracking mappings.                                                                                  |
| Exceptions                   | reference-only/exceptions.csv                     | Reference-only                       | Not applicable                    | Lists validation and migration findings with severity and blocks-export status.                                                                      |
| Canonical assessment         | secured job artifact/financial-assessment-v1.json | Authoritative deterministic result   | Same-company regeneration pending | Immutable FinancialAssessmentV1 used for canonical controls, findings, decisions, scores, status, evidence, and lineage.                             |
| Legacy validation projection | reference-only/validation-report.json             | Temporary renderer compatibility     | Not applicable                    | Derived from the canonical assessment without recomputing findings, score, or readiness.                                                             |
| PDF report                   | reference-only/migration-health-report.pdf        | Reference-only                       | Not applicable                    | Existing PDF renderer consumes the canonical assessment through the temporary compatibility projection.                                              |
| Unsupported records          | unsupported/unsupported-records.csv               | Reference-only                       | Not applicable                    | Records that V1 cannot safely express in Xero CSV import without manual work.                                                                        |
| Excluded records             | excluded/excluded-records.csv                     | Reference-only                       | Not applicable                    | Blocking findings and records that should not be imported until remediated.                                                                          |
| Excluded unused accounts     | excluded/excluded-unused-accounts.csv             | Reference-only                       | Not applicable                    | Consolidated evidence for unused accounts omitted from import-ready files without affecting readiness or assessment coverage.                        |

## Compatibility constraints accounted for

- QBO and Xero entities do not map one-to-one.
- Xero account codes must be unique and safe for import.
- Zero-balance accounts with no scoped activity or migration dependency are excluded with retained lineage.
- Xero tracking supports a maximum of two active tracking categories.
- Xero system accounts require review only where destination treatment is explicit or ambiguous; routine deterministic mappings are automatic.
- Regional tax codes may need manual mapping after export.
- Historical payment allocation state may not import cleanly from CSV alone.
- Unsupported historical state, inventory, payroll, and attachments are excluded from V1 import-ready files.

## Live certification status

Live Xero import certification has not been executed in this repository session because no disposable Xero organisation or verified QBO sandbox package was available. Populate `docs/live-verification/xero-import-results.md` before changing any row to live-certified.

## Live certification gate

Before production launch, complete all of the following and commit sanitized evidence only:

- `docs/live-verification/intuit-sandbox-results.md`
- `docs/live-verification/supabase-security-results.md`
- `docs/live-verification/xero-import-results.md`
- `docs/live-verification/reconciliation-results.md`
- A dated machine-readable reconciliation JSON derived from `docs/live-verification/reconciliation-result.template.json`

The launch decision must state exact differences for trial balance, AR, AP, bank balances, open invoice balances, and open bill balances.

## Financial Assessment renderer gate

The canonical FinancialAssessmentV1 engine is fixture- and contract-validated. Public report and Auditor renderer migration remain blocked until the same real QBO company used for the legacy 0-score baseline is regenerated and reviewed.

See:

- `docs/financial-assessment-v1.md`
- `docs/live-verification/financial-assessment-before-after.md`

Do not classify the application as launch-ready solely from golden fixtures. The live comparison, Xero import certification, and destination reconciliation gates remain open.
