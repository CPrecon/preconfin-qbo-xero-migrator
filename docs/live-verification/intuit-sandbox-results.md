# Intuit Sandbox Results

Status: not executed in this session.
Reason: no Intuit sandbox credentials or local `.env` file were available.
Starting commit: e0e7058413876dfa0fd1dd41a732ff7c9676dfad

## Required evidence to capture

| Evidence                     | Result                                  |
| ---------------------------- | --------------------------------------- |
| OAuth authorization start    | Not run                                 |
| OAuth callback               | Not run                                 |
| State validation             | Fixture-verified only                   |
| PKCE validation              | Fixture-verified only                   |
| Encrypted token persistence  | Code-reviewed and fixture-verified only |
| Realm/company ID persistence | Not run live                            |
| Access-token refresh         | Not run live                            |
| Token revocation             | Not run live                            |
| Disconnect/reconnect         | Not run live                            |
| Expired-token recovery       | Not run live                            |

## Source extraction checklist

Record endpoint status and counts only. Do not commit raw payloads.

| Source                | Endpoint/report        | Status  | Count |
| --------------------- | ---------------------- | ------- | ----- |
| Company information   | CompanyInfo            | Not run | n/a   |
| Chart of accounts     | Account query          | Not run | n/a   |
| Customers             | Customer query         | Not run | n/a   |
| Vendors               | Vendor query           | Not run | n/a   |
| Items                 | Item query             | Not run | n/a   |
| Invoices              | Invoice query          | Not run | n/a   |
| Bills                 | Bill query             | Not run | n/a   |
| Payments              | Payment query          | Not run | n/a   |
| Credit memos          | CreditMemo query       | Not run | n/a   |
| Vendor credits        | VendorCredit query     | Not run | n/a   |
| Journal entries       | JournalEntry query     | Not run | n/a   |
| Classes               | Class query            | Not run | n/a   |
| Departments/locations | Department query       | Not run | n/a   |
| Tax rates             | TaxRate query          | Not run | n/a   |
| Tax codes             | TaxCode query          | Not run | n/a   |
| Currencies            | Currency query         | Not run | n/a   |
| Trial balance         | TrialBalance report    | Not run | n/a   |
| Balance sheet         | BalanceSheet report    | Not run | n/a   |
| Profit and loss       | ProfitAndLoss report   | Not run | n/a   |
| AR aging              | AgedReceivables report | Not run | n/a   |
| AP aging              | AgedPayables report    | Not run | n/a   |

## Sanitized financial controls

| Control                    | Value   |
| -------------------------- | ------- |
| Extraction timestamp       | Not run |
| Trial-balance total        | Not run |
| AR balance                 | Not run |
| AP balance                 | Not run |
| Warnings                   | Not run |
| Errors                     | Not run |
| Unsupported source records | Not run |

## Operator notes

Complete this file only after running against a real Intuit sandbox company. Keep values aggregated and sanitized.
