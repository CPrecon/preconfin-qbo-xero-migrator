# Live Financial Assessment Before/After Gate

## Status

**Not completed. Renderer/UI work is blocked.**

The repository does not contain the private real-company baseline JSON/PDF/ZIP, a reusable sanitized canonical snapshot from that company, or live Intuit credentials. No same-company assessment was regenerated in this implementation session.

This is an evidence gap, not an engine fallback. Fixture results must not be represented as live-company verification.

## Formal before state

The following aggregate baseline was supplied from artifacts generated before Milestone 2:

| Measure       | Legacy result |
| ------------- | ------------: |
| Overall score |             0 |
| Readiness     |       Blocked |
| Errors        |            54 |
| Warnings      |            16 |

Known baseline behavior included repeated findings, standard QBO account types classified as unsupported, invoice account-reference false positives, invoice total-normalization concerns, tax mapping mixed with accounting errors, and generic recommendations.

These are observations of legacy product behavior. They are not confirmed accounting defects.

## Required same-company run

Use the private baseline `migration-health-report` JSON and rerun the same QBO company through a deployed build containing the canonical engine. Do not commit either private artifact.

1. Record the legacy artifact generation timestamp and extraction scope in the private verification record.
2. Confirm the same QBO realm/company and the same accounting basis and reporting period.
3. Run one new migration assessment.
4. Download the authorized JSON artifact named `financial-assessment-v1.json`.
5. Verify the JSON artifact belongs to the expected job through the authenticated artifact endpoint.
6. Run the sanitized comparison:

```bash
npm run baseline:compare -w packages/financial-assessment-engine -- \
  /secure/path/legacy-validation-report.json \
  /secure/path/financial-assessment-v1.json \
  > /secure/path/financial-assessment-before-after.md
```

7. Review every removed legacy code and every failed canonical control with an accountant or authorized operator.
8. Copy only aggregate counts, code names, statuses, and sanitized conclusions into this document.
9. Do not copy company names, balances, record IDs, transaction descriptions, contacts, tokens, or raw payloads.

## Required comparison record

Complete this table from the generated sanitized comparison:

| Measure                       |           Legacy baseline | Regenerated assessment |
| ----------------------------- | ------------------------: | ---------------------: |
| Finding occurrences           |                        70 |                Pending |
| Unique legacy roots           |                   Pending |         Not applicable |
| Canonical root-cause findings |            Not applicable |                Pending |
| Separate migration decisions  |                     Mixed |                Pending |
| Duplicate occurrences removed |                   Pending |                Pending |
| Financial Integrity score     |             Not available |                Pending |
| Reconciliation score          |             Not available |                Pending |
| Migration Readiness score     | 0 (legacy combined score) |                Pending |
| Data Quality score            |             Not available |                Pending |
| Evidence Coverage score       |             Not available |                Pending |
| Assessment coverage           |             Not available |                Pending |
| Overall deterministic status  |                   Blocked |                Pending |

Document:

- removed false positives;
- merged duplicate root causes;
- accounting issues separated from migration decisions;
- corrected account mappings;
- corrected invoice and bill normalization;
- unchanged genuine financial discrepancies;
- newly discovered genuine issues;
- unavailable controls and extraction limitations.

## Approval criteria

The live gate passes only when:

- both artifacts are confirmed to represent the same company and scope;
- every baseline finding has one of the five approved classifications;
- standard mapped account types are not reported as unsupported;
- valid ItemRef-derived invoice accounts do not produce missing-account findings;
- normalized invoice and bill totals compare equivalent amounts;
- tax and account choices appear as decisions rather than accounting errors;
- repeated signals collapse to one root cause with supporting evidence;
- genuine failed controls remain visible and unchanged unless source evidence changed;
- unavailable controls reduce coverage and do not pass;
- the reviewer concludes the canonical assessment is materially more accurate.

Record reviewer, date, source job IDs in the private evidence system, and a sanitized approval statement here. Only then may the renderer/UI milestone start.
