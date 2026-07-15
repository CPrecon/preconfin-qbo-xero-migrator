import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adaptFinancialAssessmentForAuditor,
  adaptFinancialAssessmentForMigrator,
  createFinancialAssessment,
  financialAssessmentV1Schema,
  stableStringify,
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
    expect(generate("clean-company").overallStatus).toBe("migration_ready");
    expect(generate("manufacturing-company").overallStatus).toBe(
      "review_recommended",
    );
    expect(generate("messy-books").overallStatus).toBe("blocked");
    expect(generate("migration-edge-cases").overallStatus).toBe("incomplete");
  });

  it("limits mapping decisions to migration readiness scoring", () => {
    const assessment = generate("manufacturing-company");
    expect(assessment.decisions.length).toBeGreaterThan(0);
    expect(assessment.scorecard.financialIntegrity.score).toBe(100);
    expect(assessment.scorecard.reconciliation.score).toBe(100);
    expect(assessment.scorecard.dataQuality.score).toBe(100);
    expect(assessment.scorecard.migrationReadiness.score).toBeLessThan(100);
  });

  it("aggregates one account mapping decision per root account", () => {
    const assessment = generate("migration-edge-cases");
    const accountDecisions = assessment.decisions.filter((decision) =>
      decision.affectedRecords.some(
        (record) => record.sourceType === "account",
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
    const informational = createFinancialAssessment({
      ...fixture,
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
      ...fixture,
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
