# Xero CSV Compatibility Matrix

This matrix documents the V1 export intent. The generated package is designed for controlled review and Xero demo import testing before production use.

| Export              | Package path                               | Status                               | Notes                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chart of accounts   | import-ready/chart-of-accounts.csv         | Import-ready after review            | Uses mapped Xero account code, type, tax type, dashboard, expense claim, and payment flags. System accounts such as receivables, payables, bank, and retained earnings still require accountant review. |
| Contacts            | import-ready/contacts.csv                  | Import-ready after review            | Consolidates customers and suppliers as contacts. Duplicate names are warnings because Xero may merge or reject duplicates depending on import path.                                                    |
| Items               | import-ready/items.csv                     | Import-ready for non-inventory items | Inventory items are flagged as unsupported for V1 because Xero inventory setup may require manual configuration.                                                                                        |
| Sales invoices      | import-ready/sales-invoices.csv            | Import-ready after validation        | Uses contact names and mapped Xero account codes. Does not write payment allocation state directly to Xero.                                                                                             |
| Bills               | import-ready/bills.csv                     | Import-ready after validation        | Uses supplier contact names and mapped Xero account codes. Payment state requires manual review after import.                                                                                           |
| Credit notes        | import-ready/credit-notes.csv              | Import-ready after validation        | Separates customer and supplier credits by Type field. Allocation history may require manual reconciliation.                                                                                            |
| Manual journals     | manual-configuration/manual-journals.csv   | Manual configuration                 | Generated only from balanced journals. Review tax and account mapping before import.                                                                                                                    |
| Bank statements     | manual-configuration/bank-statements.csv   | Manual configuration                 | Payment-derived bank rows are reference-ready, not a substitute for bank-feed reconciliation.                                                                                                           |
| Opening balances    | manual-configuration/opening-balances.csv  | Manual configuration                 | Derived from trial-balance rows. Retained earnings, AR, AP, bank, and tax balances must be reconciled before use.                                                                                       |
| Mapping report      | reference-only/mapping-report.csv          | Reference-only                       | Shows generated account, tax, contact, item, and tracking mappings.                                                                                                                                     |
| Exceptions          | reference-only/exceptions.csv              | Reference-only                       | Lists validation and migration findings with severity and blocks-export status.                                                                                                                         |
| Validation report   | reference-only/validation-report.json      | Reference-only                       | Machine-readable validation result.                                                                                                                                                                     |
| PDF report          | reference-only/migration-health-report.pdf | Reference-only                       | Branded human-readable migration health report.                                                                                                                                                         |
| Unsupported records | unsupported/unsupported-records.csv        | Reference-only                       | Records that V1 cannot safely express in Xero CSV import without manual work.                                                                                                                           |
| Excluded records    | excluded/excluded-records.csv              | Reference-only                       | Blocking findings and records that should not be imported until remediated.                                                                                                                             |

## Compatibility constraints accounted for

- QBO and Xero entities do not map one-to-one.
- Xero account codes must be unique and safe for import.
- Xero tracking supports a maximum of two active tracking categories.
- Xero system accounts require manual review, especially receivables, payables, retained earnings, and bank accounts.
- Regional tax codes may need manual mapping after export.
- Historical payment allocation state may not import cleanly from CSV alone.
- Unsupported historical state, inventory, payroll, and attachments are excluded from V1 import-ready files.
