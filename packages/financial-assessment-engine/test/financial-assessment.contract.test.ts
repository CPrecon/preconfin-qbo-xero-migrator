import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createMigrationPlan } from "@preconfin/migration-engine";
import {
  adaptFinancialAssessmentForAuditor,
  adaptFinancialAssessmentForMigrator,
  createFinancialAssessment,
  financialAssessmentV1Schema,
  stableStringify,
  toPublicMigrationAssessment,
  type FinancialAssessmentV1,
} from "../src/index.js";
import {
  createAssessmentFixture,
  FIXTURE_GENERATED_AT,
  FIXTURE_NAMES,
  type FixtureName,
} from "./fixture-factory.js";

const fixtureRoot = resolve(import.meta.dirname, "..", "fixtures");

async function expectedBytes(name: FixtureName): Promise<string> {
  return readFile(
    resolve(fixtureRoot, name, "financial-assessment-v1.json"),
    "utf8",
  );
}

function generate(name: FixtureName): FinancialAssessmentV1 {
  const fixture = createAssessmentFixture(name);
  return createFinancialAssessment({
    ...fixture,
    assessmentType: "migration_readiness",
    generatedAt: FIXTURE_GENERATED_AT,
  });
}

function reverseAssessmentInput(name: FixtureName) {
  const fixture = createAssessmentFixture(name);
  const snapshot = structuredClone(fixture.snapshot);
  snapshot.accounts.reverse();
  snapshot.contacts.reverse();
  snapshot.items.reverse();
  snapshot.invoices.reverse();
  snapshot.bills.reverse();
  snapshot.payments.reverse();
  snapshot.credits.reverse();
  snapshot.journals.reverse();
  snapshot.taxRates.reverse();
  snapshot.taxCodes?.reverse();
  snapshot.currencies.reverse();
  snapshot.tracking.reverse();
  snapshot.balances.reverse();
  snapshot.reports.trialBalance.reverse();
  snapshot.reports.profitAndLoss.reverse();
  snapshot.reports.balanceSheet.reverse();
  snapshot.reports.arAging.reverse();
  snapshot.reports.apAging.reverse();

  return {
    snapshot,
    plan: {
      ...fixture.plan,
      accountMappings: [...fixture.plan.accountMappings].reverse(),
      accountScope: fixture.plan.accountScope
        ? [...fixture.plan.accountScope].reverse()
        : undefined,
      taxMappings: [...fixture.plan.taxMappings].reverse(),
      contactMappings: [...fixture.plan.contactMappings].reverse(),
      itemMappings: [...fixture.plan.itemMappings].reverse(),
      trackingMappings: [...fixture.plan.trackingMappings].reverse(),
      exceptions: [...fixture.plan.exceptions].reverse(),
    },
  };
}

describe("FinancialAssessmentV1 golden conformance", () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name} matches its immutable expected assessment byte for byte`, async () => {
      const expected = await expectedBytes(name);
      expect(() =>
        financialAssessmentV1Schema.parse(JSON.parse(expected)),
      ).not.toThrow();
      const actual = generate(name);
      expect(stableStringify(actual, 2) + "\n").toBe(expected);
    });
  }

  it("is independent of canonical collection and plan ordering", () => {
    const expected = generate("messy-books");
    const reordered = reverseAssessmentInput("messy-books");
    const actual = createFinancialAssessment({
      ...reordered,
      assessmentType: "migration_readiness",
      generatedAt: FIXTURE_GENERATED_AT,
    });
    expect(stableStringify(actual)).toBe(stableStringify(expected));
  });

  it("emits stable, unique issue and occurrence identifiers", () => {
    const assessment = generate("messy-books");
    const issueKeys = assessment.findings.map((finding) => finding.issueKey);
    const occurrenceIds = [
      ...assessment.findings.map((finding) => finding.occurrenceId),
      ...assessment.decisions.map((decision) => decision.occurrenceId),
    ];
    expect(new Set(issueKeys).size).toBe(issueKeys.length);
    expect(new Set(occurrenceIds).size).toBe(occurrenceIds.length);
    expect(generate("messy-books").identity).toEqual(assessment.identity);
  });

  it("deep-freezes the canonical object and consumer adapters", () => {
    const assessment = generate("clean-company");
    expect(Object.isFrozen(assessment)).toBe(true);
    expect(Object.isFrozen(assessment.controls)).toBe(true);
    expect(Object.isFrozen(assessment.controls[0])).toBe(true);

    const auditor = adaptFinancialAssessmentForAuditor(assessment);
    const migrator = adaptFinancialAssessmentForMigrator(assessment);
    expect(Object.isFrozen(auditor)).toBe(true);
    expect(Object.isFrozen(migrator)).toBe(true);
    expect(migrator.migrationReadinessScore).toBe(
      assessment.scorecard.migrationReadiness.score,
    );
    expect(auditor.controlsByCode.CONTROL_TRIAL_BALANCE).toEqual(
      assessment.controls[0],
    );
  });

  it("uses deterministic gates independently from score values", () => {
    expect(generate("clean-company").overallStatus).toBe("review_recommended");
    expect(generate("manufacturing-company").overallStatus).toBe(
      "review_recommended",
    );
    expect(generate("messy-books").overallStatus).toBe("blocked");
    expect(generate("migration-edge-cases").overallStatus).toBe("incomplete");
  });

  it("presents mapping-only work as Ready with Review, never Blocked", () => {
    const assessment = generate("clean-company");
    const report = toPublicMigrationAssessment(assessment);

    expect(assessment.decisions.length).toBeGreaterThan(0);
    expect(assessment.summary.blockingIssueCount).toBe(0);
    expect(assessment.summary.actionRequiredCount).toBe(0);
    expect(report.readiness).toMatchObject({
      state: "ready_with_review",
      label: "Ready with Review",
    });
    expect(report.scores).toEqual({
      financialHealth: assessment.scorecard.financialIntegrity.score,
      migrationReadiness: assessment.scorecard.migrationReadiness.score,
      manualReviewRequired: assessment.decisions.length,
    });
  });

  it("limits mapping decisions to migration readiness scoring", () => {
    const assessment = generate("manufacturing-company");
    expect(assessment.decisions.length).toBeGreaterThan(0);
    expect(assessment.scorecard.financialIntegrity.score).toBe(100);
    expect(assessment.scorecard.reconciliation.score).toBe(100);
    expect(assessment.scorecard.dataQuality.score).toBe(100);
    expect(assessment.scorecard.migrationReadiness.score).toBeLessThan(100);
  });

  it("adds deterministic priority, effort, impact, and timing to recommendations", () => {
    const assessment = generate("messy-books");
    expect(assessment.recommendations.length).toBeGreaterThan(0);
    expect(
      assessment.recommendations.every(
        (recommendation) =>
          recommendation.priority > 0 &&
          Boolean(recommendation.businessImpact) &&
          Boolean(recommendation.expectedCompletionTime),
      ),
    ).toBe(true);
    expect(assessment.recommendations.map((item) => item.priority)).toEqual(
      assessment.recommendations.map((_, index) => index + 1),
    );
  });

  it("exposes deterministic mapping classifications and rationale without technical IDs", () => {
    const report = toPublicMigrationAssessment(generate("clean-company"));
    expect(report.mappingReview.requiresReview).toBeGreaterThan(0);
    const reviewMappings = report.mappingReview.mappings.filter(
      (mapping) => mapping.reviewStatus === "requires_review",
    );
    const automaticMappings = report.mappingReview.mappings.filter(
      (mapping) => mapping.reviewStatus === "automatically_accepted",
    );
    expect(reviewMappings).toHaveLength(report.mappingReview.requiresReview);
    expect(
      reviewMappings.every(
        (mapping) =>
          ["Recommended", "Requires Review", "Manual Decision"].includes(
            mapping.confidenceClassification,
          ) &&
          mapping.businessReason.length > 0 &&
          mapping.requiredAction.length > 0,
      ),
    ).toBe(true);
    expect(automaticMappings).toHaveLength(
      report.mappingReview.automaticallyAccepted,
    );
    expect(
      report.mappingReview.mappings.every(
        (mapping) =>
          [
            "Automatic",
            "Recommended",
            "Requires Review",
            "Manual Decision",
          ].includes(mapping.confidenceClassification) &&
          mapping.reason.length > 0 &&
          mapping.target.length > 0 &&
          mapping.proposedTreatment.length > 0,
      ),
    ).toBe(true);
    expect(JSON.stringify(report.mappingReview.mappings)).not.toMatch(
      /sourceId|decisionKey|occurrenceId|confidencePercentage/,
    );
  });

  it("ends with the deterministic consultant workflow and no generic consultation step", () => {
    const report = toPublicMigrationAssessment(generate("clean-company"));
    expect(report.nextSteps.map((step) => step.title)).toEqual([
      "Resolve accounting issues",
      "Confirm migration decisions",
      "Generate migration package",
      "Import into Xero Demo Organisation",
      "Verify Trial Balance",
      "Go Live",
    ]);
    expect(JSON.stringify(report.nextSteps)).not.toMatch(/consultation/i);
    expect(report.supportRecommended).toBe(false);
  });

  it("merges each account scope row with its canonical account decision", () => {
    const assessment = generate("clean-company");
    const report = toPublicMigrationAssessment(assessment);
    const manualMappings = report.mappingReview.mappings.filter(
      (mapping) => mapping.reviewStatus === "requires_review",
    );
    const publicRoots = manualMappings.map((mapping) =>
      [mapping.group, mapping.title, mapping.proposedTreatment]
        .join("|")
        .toLowerCase(),
    );

    expect(new Set(publicRoots).size).toBe(publicRoots.length);
    expect(manualMappings).toHaveLength(report.mappingReview.requiresReview);
    expect(report.scores.manualReviewRequired).toBe(
      report.mappingReview.requiresReview,
    );
    expect(manualMappings.length).toBeLessThanOrEqual(
      assessment.decisions.length,
    );
  });

  it("deduplicates recommendations and keeps deterministic priorities", () => {
    const report = toPublicMigrationAssessment(generate("messy-books"));
    const roots = report.recommendations.map((recommendation) =>
      [recommendation.title, recommendation.fixLocation]
        .join("|")
        .toLowerCase(),
    );

    expect(new Set(roots).size).toBe(roots.length);
    expect(report.recommendations.map((item) => item.priority)).toEqual(
      report.recommendations.map((_, index) => index + 1),
    );
  });

  it("uses business control labels and deterministic executive copy", () => {
    const assessment = generate("migration-edge-cases");
    const first = toPublicMigrationAssessment(assessment);
    const second = toPublicMigrationAssessment(assessment);

    expect(first.executiveSummary).toBe(second.executiveSummary);
    expect(first.executiveSummary).toMatch(
      /books|financial position|migration decision/i,
    );
    expect(first.controls.every((control) => control.evidence.length > 0)).toBe(
      true,
    );
    expect(
      first.controls.every((control) => control.businessImpact.length > 0),
    ).toBe(true);
    expect(first.controls.map((control) => control.statusLabel)).not.toContain(
      "Unknown",
    );
    expect(JSON.stringify(first)).not.toMatch(
      /occurrenceId|decisionKey|issueKey|rootKey|entityId/,
    );
  });

  it("aggregates one account mapping decision per root account", () => {
    const assessment = generate("migration-edge-cases");
    const accountDecisions = assessment.decisions.filter((decision) =>
      decision.affectedRecords.some(
        (record) => record.sourceId === "acct_nonposting",
      ),
    );
    expect(accountDecisions).toHaveLength(1);
    expect(accountDecisions[0]!.evidence.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        "Deterministic rule UNSUPPORTED_ACCOUNT_TYPE",
        "Deterministic rule INVALID_XERO_ACCOUNT_CODE",
        "Deterministic rule MAPPING_ACCOUNT",
      ]),
    );
  });

  it("marks unavailable controls as incomplete and reduces coverage", () => {
    const assessment = generate("migration-edge-cases");
    expect(
      assessment.controls
        .filter((control) => control.blockingGate)
        .some((control) => control.status === "unavailable"),
    ).toBe(true);
    expect(assessment.assessmentCoverage.percentage).toBeLessThan(100);
    expect(assessment.scorecard.reconciliation.score).toBe(40);
    expect(assessment.overallStatus).toBe("incomplete");
  });

  it("treats a zero bank balance as available control evidence", () => {
    const fixture = createAssessmentFixture("clean-company");
    const bank = fixture.snapshot.accounts.find(
      (account) => account.id === "acct_bank",
    )!;
    bank.currentBalance = { amount: 0, currency: "USD" };
    fixture.snapshot.reports.trialBalance.find(
      (row) => row.accountId === bank.id,
    )!.amount.amount = 0;
    fixture.snapshot.reports.balanceSheet.find(
      (row) => row.accountId === bank.id,
    )!.amount.amount = 0;

    const assessment = createFinancialAssessment({
      ...fixture,
      assessmentType: "migration_readiness",
      generatedAt: FIXTURE_GENERATED_AT,
    });
    expect(
      assessment.controls.find(
        (control) => control.code === "CONTROL_BANK_RECONCILIATION",
      )?.status,
    ).toBe("passed");
  });

  it("does not silently pass a partially covered closing-balance control", () => {
    const fixture = createAssessmentFixture("clean-company");
    fixture.snapshot.reports.trialBalance =
      fixture.snapshot.reports.trialBalance.filter(
        (row) => row.accountId !== "acct_retained",
      );

    const assessment = createFinancialAssessment({
      ...fixture,
      assessmentType: "migration_readiness",
      generatedAt: FIXTURE_GENERATED_AT,
    });
    const closingBalances = assessment.controls.find(
      (control) => control.code === "CONTROL_CLOSING_BALANCES",
    );
    expect(closingBalances?.coverage.status).toBe("partial");
    expect(closingBalances?.status).toBe("warning");
  });

  it("builds financial-health assessments without migration logic", () => {
    const fixture = createAssessmentFixture("messy-books");
    const assessment = createFinancialAssessment({
      snapshot: fixture.snapshot,
      assessmentType: "financial_health",
      generatedAt: FIXTURE_GENERATED_AT,
    });
    expect(assessment.findings.length).toBeGreaterThan(0);
    expect(assessment.decisions).toEqual([]);
    expect(assessment.lineage.generatedFrom).not.toContain("migration-plan");
    expect(assessment.summary.primaryRecommendation).not.toMatch(
      /migration|xero/i,
    );
  });

  it("requires a plan for migration-specific assessment profiles", () => {
    const fixture = createAssessmentFixture("clean-company");
    expect(() =>
      createFinancialAssessment({
        snapshot: fixture.snapshot,
        assessmentType: "migration_readiness",
        generatedAt: FIXTURE_GENERATED_AT,
      }),
    ).toThrow("migration_readiness assessments require a migration plan");
  });

  it("requires deterministic destination reconciliation evidence for Verified", () => {
    const fixture = createAssessmentFixture("clean-company");
    const resolvedDecisionCount =
      fixture.plan.accountScopeSummary?.decisionRequiredAccounts ?? 0;
    const resolvedPlan = {
      ...fixture.plan,
      accountScope: fixture.plan.accountScope?.map((scope) => ({
        ...scope,
        disposition:
          scope.disposition === "decision_required"
            ? ("auto_mapped" as const)
            : scope.disposition,
        decisionReason: undefined,
      })),
      accountScopeSummary: fixture.plan.accountScopeSummary
        ? {
            ...fixture.plan.accountScopeSummary,
            autoMappedAccounts:
              fixture.plan.accountScopeSummary.autoMappedAccounts +
              resolvedDecisionCount,
            decisionRequiredAccounts: 0,
          }
        : undefined,
    };
    const informational = createFinancialAssessment({
      snapshot: fixture.snapshot,
      plan: resolvedPlan,
      generatedAt: FIXTURE_GENERATED_AT,
      verificationEvidence: {
        verifiedAt: FIXTURE_GENERATED_AT,
        destinationSystem: "xero",
        evidence: [
          {
            evidenceId: "evidence_note",
            evidenceType: "document",
            sourceSystem: "xero",
            label: "Destination review note",
          },
        ],
      },
    });
    expect(informational.overallStatus).toBe("migration_ready");

    const verified = createFinancialAssessment({
      snapshot: fixture.snapshot,
      plan: resolvedPlan,
      generatedAt: FIXTURE_GENERATED_AT,
      assessmentType: "post_migration_reconciliation",
      verificationEvidence: {
        verifiedAt: FIXTURE_GENERATED_AT,
        destinationSystem: "xero",
        evidence: [
          {
            evidenceId: "evidence_reconciliation",
            evidenceType: "reconciliation",
            sourceSystem: "xero",
            label: "Destination control reconciliation",
          },
        ],
      },
    });
    expect(verified.overallStatus).toBe("verified");
    expect(verified.verificationEvidence?.evidence).toHaveLength(1);
    expect(verified.evidenceSummary.sourceSystems).toContain("xero");
    expect(verified.sourceSystems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          system: "xero",
          recordCount: 1,
        }),
      ]),
    );
  });

  it("keeps corrected invoice and bill normalization free of false positives", () => {
    const assessment = generate("service-business");
    expect(
      assessment.findings.filter((finding) =>
        [
          "MISSING_ACCOUNT_REFERENCE",
          "INVOICE_TOTAL_MISMATCH",
          "BILL_TOTAL_MISMATCH",
        ].includes(finding.ruleCode),
      ),
    ).toEqual([]);
  });

  it("classifies an invalid tax reference only as source data quality", () => {
    const assessment = generate("migration-edge-cases");
    expect(
      assessment.findings.some(
        (finding) =>
          finding.ruleCode === "INVALID_TAX_REFERENCE" &&
          finding.issueClass === "source_data_quality",
      ),
    ).toBe(true);
    expect(
      assessment.decisions.some((decision) =>
        decision.evidence.some(
          (evidence) =>
            evidence.label === "Deterministic rule MISSING_TAX_MAPPING",
        ),
      ),
    ).toBe(false);
  });

  it("locks financial control differences and readiness penalties", () => {
    const clean = generate("clean-company");
    const messy = generate("messy-books");
    const differences = Object.fromEntries(
      messy.controls.map((control) => [
        control.code,
        control.comparison.difference,
      ]),
    );
    expect(differences).toMatchObject({
      CONTROL_TRIAL_BALANCE: 50,
      CONTROL_ACCOUNTS_RECEIVABLE: 400,
      CONTROL_ACCOUNTS_PAYABLE: 100,
      CONTROL_BANK_RECONCILIATION: -1050,
      CONTROL_RETAINED_EARNINGS: -200,
      CONTROL_OPENING_BALANCES: 50,
      CONTROL_CLOSING_BALANCES: -150,
    });
    expect(messy.scorecard.migrationReadiness.score).toBeLessThan(
      clean.scorecard.migrationReadiness.score,
    );
    expect(messy.overallStatus).toBe("blocked");
  });

  it("suppresses duplicate-account cleanup when every duplicate is unused", () => {
    const fixture = createAssessmentFixture("clean-company");
    fixture.snapshot.accounts.push(
      {
        id: "acct_unused_duplicate_1",
        code: "8010",
        name: "Unused Duplicate",
        classification: "expense",
        sourceAccountType: "Expense",
        active: true,
        source: {
          sourceSystem: "quickbooks-online",
          sourceId: "unused_duplicate_1",
          sourceType: "account",
          metadata: {},
        },
      },
      {
        id: "acct_unused_duplicate_2",
        code: "8020",
        name: "Unused Duplicate",
        classification: "expense",
        sourceAccountType: "Expense",
        active: false,
        source: {
          sourceSystem: "quickbooks-online",
          sourceId: "unused_duplicate_2",
          sourceType: "account",
          metadata: {},
        },
      },
    );
    const assessment = createFinancialAssessment({
      snapshot: fixture.snapshot,
      plan: createMigrationPlan(fixture.snapshot),
      assessmentType: "migration_readiness",
      generatedAt: FIXTURE_GENERATED_AT,
    });

    expect(
      assessment.findings.filter((finding) =>
        ["DUPLICATE_ACCOUNT", "UNUSED_DUPLICATE_ACCOUNT"].includes(
          finding.ruleCode,
        ),
      ),
    ).toEqual([]);
  });

  it("retains a duplicate-account finding when both accounts are active", () => {
    const fixture = createAssessmentFixture("clean-company");
    fixture.snapshot.accounts.push(
      {
        id: "acct_active_duplicate_1",
        code: "8010",
        name: "Active Duplicate",
        classification: "expense",
        sourceAccountType: "Expense",
        currentBalance: { amount: 10, currency: "USD" },
        active: true,
        source: {
          sourceSystem: "quickbooks-online",
          sourceId: "active_duplicate_1",
          sourceType: "account",
          metadata: {},
        },
      },
      {
        id: "acct_active_duplicate_2",
        code: "8020",
        name: "Active Duplicate",
        classification: "expense",
        sourceAccountType: "Expense",
        currentBalance: { amount: 20, currency: "USD" },
        active: true,
        source: {
          sourceSystem: "quickbooks-online",
          sourceId: "active_duplicate_2",
          sourceType: "account",
          metadata: {},
        },
      },
    );
    const assessment = createFinancialAssessment({
      snapshot: fixture.snapshot,
      plan: createMigrationPlan(fixture.snapshot),
      assessmentType: "migration_readiness",
      generatedAt: FIXTURE_GENERATED_AT,
    });

    expect(
      assessment.findings.some(
        (finding) => finding.ruleCode === "DUPLICATE_ACCOUNT",
      ),
    ).toBe(true);
  });

  it("keeps excluded unused accounts out of assessment scores and decisions", () => {
    const fixture = createAssessmentFixture("clean-company");
    const baseline = createFinancialAssessment({
      ...fixture,
      assessmentType: "migration_readiness",
      generatedAt: FIXTURE_GENERATED_AT,
    });
    fixture.snapshot.accounts.push({
      id: "acct_unused",
      code: "8999",
      name: "Unused Expense",
      classification: "expense",
      sourceAccountType: "Expense",
      active: true,
      source: {
        sourceSystem: "quickbooks-online",
        sourceId: "unused",
        sourceType: "account",
        metadata: {},
      },
    });
    const assessment = createFinancialAssessment({
      snapshot: fixture.snapshot,
      plan: createMigrationPlan(fixture.snapshot),
      assessmentType: "migration_readiness",
      generatedAt: FIXTURE_GENERATED_AT,
    });

    expect(assessment.scorecard).toEqual(baseline.scorecard);
    expect(assessment.overallStatus).toBe(baseline.overallStatus);
    expect(assessment.decisions).toEqual(baseline.decisions);
    expect(assessment.accountScopeSummary?.excludedUnusedAccounts).toBe(1);
  });

  it("reconciles account-scope summary totals in the canonical contract", () => {
    const assessment = generate("manufacturing-company");
    const summary = assessment.accountScopeSummary!;
    expect(summary.totalAccounts).toBe(
      summary.relevantAccounts + summary.excludedUnusedAccounts,
    );
    expect(summary.relevantAccounts).toBe(
      summary.autoMappedAccounts + summary.decisionRequiredAccounts,
    );
    expect(assessment.accountScope).toHaveLength(summary.totalAccounts);
  });

  it("normalizes equivalent report signs before failing financial controls", () => {
    const fixture = createAssessmentFixture("clean-company");
    for (const row of fixture.snapshot.reports.balanceSheet) {
      row.amount.amount *= -1;
    }
    const assessment = createFinancialAssessment({
      snapshot: fixture.snapshot,
      plan: createMigrationPlan(fixture.snapshot),
      assessmentType: "migration_readiness",
      generatedAt: FIXTURE_GENERATED_AT,
    });
    const retainedEarnings = assessment.controls.find(
      (control) => control.code === "CONTROL_RETAINED_EARNINGS",
    );
    const closingBalances = assessment.controls.find(
      (control) => control.code === "CONTROL_CLOSING_BALANCES",
    );

    expect(retainedEarnings).toMatchObject({
      status: "passed",
      comparison: { difference: 0 },
    });
    expect(closingBalances).toMatchObject({
      status: "passed",
      comparison: { difference: 0 },
    });
  });

  it("recommends a source refresh when freshness fails", () => {
    const fixture = createAssessmentFixture("clean-company");
    const assessment = createFinancialAssessment({
      ...fixture,
      assessmentType: "migration_readiness",
      generatedAt: "2026-07-04T12:00:00.000Z",
    });
    expect(
      assessment.controls.find(
        (control) => control.code === "CONTROL_SOURCE_FRESHNESS",
      )?.status,
    ).toBe("failed");
    expect(assessment.overallStatus).toBe("action_required");
    expect(
      assessment.recommendations.map((recommendation) => recommendation.code),
    ).toContain("REFRESH_ASSESSMENT_INPUTS");
  });

  it("rejects renderer-modified or incomplete contracts", () => {
    const value = JSON.parse(JSON.stringify(generate("clean-company")));
    delete value.scorecard;
    expect(() => financialAssessmentV1Schema.parse(value)).toThrow();
  });
});
