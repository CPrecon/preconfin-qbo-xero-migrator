# PreconFin Financial Assessment V1

## Architectural role

`@preconfin/financial-assessment-engine` is the single deterministic assessment layer between the canonical accounting model and every report renderer.

```text
QBO extraction
  -> canonical accounting snapshot
  -> migration plan
  -> Financial Assessment engine
  -> immutable FinancialAssessmentV1
  -> Auditor / Migrator / Business OS / PDF / API adapters
```

Rules, controls, classification, root-cause aggregation, scoring, status gates, evidence summaries, recommendations, and next steps are owned by this package. Renderers may filter or format the object. They must not calculate findings, controls, severity, scores, or status.

Customer-facing copy calls this object the **PreconFin Financial Assessment**. `FinancialAssessmentV1` is an internal contract name.

## Contract

The TypeScript runtime schema is in `packages/financial-assessment-engine/src/schema.ts`. The language-neutral Draft 2020-12 schema is:

```text
packages/financial-assessment-engine/schema/financial-assessment-v1.schema.json
```

The top-level contract contains:

- stable identity and organization identity;
- assessment type, generation time, period, basis, and currency;
- source-system and assessment coverage;
- deterministic overall status and five-dimensional scorecard;
- summary counts;
- ten financial controls;
- root-cause findings and separate migration decisions;
- deterministic recommendations and ordered next steps;
- evidence summary and optional destination verification evidence;
- source lineage, rule versions, and report version.

The object is parsed with a strict schema and deeply frozen before it leaves the engine.

Financial-health, bookkeeping, year-end, due-diligence, and continuous-monitoring assessments require only a canonical accounting snapshot. Migration-readiness and post-migration-reconciliation profiles additionally require a migration plan. Migration mapping rules and decisions are not evaluated for non-migration profiles.

## Controls

| Code                          | Comparison                                      | Blocking gate       |
| ----------------------------- | ----------------------------------------------- | ------------------- |
| `CONTROL_TRIAL_BALANCE`       | Signed trial-balance net against zero           | Yes                 |
| `CONTROL_ACCOUNTS_RECEIVABLE` | Open invoices against AR aging                  | Yes                 |
| `CONTROL_ACCOUNTS_PAYABLE`    | Open bills against AP aging                     | Yes                 |
| `CONTROL_BANK_RECONCILIATION` | Same-date bank balances against trial balance   | Yes                 |
| `CONTROL_RETAINED_EARNINGS`   | Trial balance against balance sheet             | Yes                 |
| `CONTROL_OPENING_BALANCES`    | Conversion-balance net against zero             | Yes                 |
| `CONTROL_CLOSING_BALANCES`    | Comparable trial-balance and balance-sheet rows | Yes                 |
| `CONTROL_TAX_LIABILITY`       | Tax-liability rows across source reports        | Yes when applicable |
| `CONTROL_EVIDENCE_COVERAGE`   | Records with stable source lineage              | No                  |
| `CONTROL_SOURCE_FRESHNESS`    | Extraction age against a 24-hour target         | No                  |

A control is `passed`, `warning`, `failed`, `unavailable`, or `not_applicable`. Missing data produces `unavailable`; it never silently passes. Each control retains its tolerance, period, basis, coverage, blocking gate, and evidence references.

## Finding classes

Each rule signal is assigned to exactly one class:

- `financial_integrity`
- `source_data_quality`
- `migration_decision`
- `product_limitation`
- `information`

Migration decisions are emitted in `decisions`, never in `findings`. Stable root keys aggregate repeated signals and affected records. Account-type, account-code, and suggested-account-treatment signals for one account become one account-mapping decision with all rule signals retained as evidence.

## Scoring

Status is not derived from score.

Control scores are deterministic: passed = 100, warning = 70, failed = 0, and unavailable = 0. Not-applicable controls are excluded from a control average. Unavailable controls also reduce assessment coverage; they never inflate a dimension by disappearing from its denominator.

Finding penalties are:

| Severity      | Penalty |
| ------------- | ------: |
| Critical      |      30 |
| High          |      15 |
| Medium        |       6 |
| Low           |       2 |
| Informational |       0 |

Dimensions:

- **Financial Integrity:** average of trial balance, retained earnings, opening balances, closing balances, and tax liability, less financial-integrity finding penalties capped at 40.
- **Reconciliation:** average of trial balance, AR, AP, bank reconciliation, and retained earnings.
- **Migration Readiness:** 100 less deterministic control penalties capped at 45, workflow-impact finding penalties capped at 35, and three points per open migration decision capped at 30. A failed blocking control costs 15, an unavailable blocking control costs 10, a failed non-blocking control costs 8, and a warning control costs 4.
- **Data Quality:** 100 less source-data-quality penalties capped at 80.
- **Evidence Coverage:** canonical source-lineage coverage percentage.

All scores are rounded and clamped to 0-100. Mapping decisions affect only Migration Readiness.

## Status gates

Precedence is:

1. `blocked`: a blocking financial control fails or a blocking financial-integrity finding remains.
2. `incomplete`: a required blocking control is unavailable.
3. `action_required`: another failed control, required finding, or required decision remains.
4. `review_recommended`: warnings or review decisions remain.
5. `migration_ready`: required controls pass and no review item remains, but destination verification evidence is absent.
6. `verified`: every applicable control passes, no finding or decision remains, and deterministic destination reconciliation evidence is embedded in the assessment.

A document, AI summary, or user acknowledgement cannot produce `verified`.

## Recommendations

Recommendations and next steps are deterministic and dependency ordered. Estimated effort is restricted to:

- Quick Review
- Source System Change
- Manual Mapping
- Accountant Review

No duration is generated by AI.

## Consumer adapters

- `adaptFinancialAssessmentForMigrator` exposes canonical migration readiness, blocking findings, and decisions without recomputation.
- `adaptFinancialAssessmentForAuditor` indexes canonical controls, open findings, and evidence without recomputation.
- `toLegacyValidationReport` in `@preconfin/validation-engine` is a temporary compatibility projection for the existing PDF and ZIP renderers. The former validation engine and its independent score calculation have been removed.
- The API constructs one assessment per run, persists `financial-assessment-v1.json`, and derives the legacy renderer projection from that same object.

No database migration is required for V1. The existing private JSON artifact record stores the canonical assessment under its migration-job scope.

## Golden conformance

Seven scenarios are committed under `packages/financial-assessment-engine/fixtures`:

- clean company;
- service business;
- inventory business;
- construction company;
- manufacturing company;
- messy books;
- migration edge cases.

Tests regenerate each complete assessment and compare exact serialized bytes. They also verify ordering independence, stable IDs, deep immutability, status gates, decision deduplication, adapter parity, and destination-verification rules.

Run:

```bash
npm run fixtures:update -w packages/financial-assessment-engine
npm run test -w packages/financial-assessment-engine
npm run test:contract
```

Golden changes require an intentional contract review. Fixture updates must not be used merely to make a regression test pass.

## Deterministic and AI boundary

The engine has no AI dependency. An AI overlay may summarize, prioritize, or explain the frozen object. It must not mutate findings, controls, severity, score, status, evidence, or lineage.

## Renderer migration gate

The existing PDF and UI remain unchanged in this milestone. Renderer adoption must not begin until:

1. the same real QBO company used for the legacy baseline is assessed with this engine;
2. the sanitized before/after comparison is reviewed;
3. removed false positives and retained genuine discrepancies are confirmed;
4. canonical assessment output is accepted as materially more accurate.
