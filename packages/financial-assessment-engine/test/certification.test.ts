import { describe, expect, it } from "vitest";
import {
  createCertificationComparison,
  renderCertificationMarkdown,
  type LegacyCertificationFinding,
} from "../src/certification.js";
import { createFinancialAssessment } from "../src/engine.js";
import {
  createAssessmentFixture,
  FIXTURE_GENERATED_AT,
} from "./fixture-factory.js";

function legacySeverity(severity: string): string {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "info";
}

function legacyFromFinding(
  finding: ReturnType<typeof createFinancialAssessment>["findings"][number],
  severity = legacySeverity(finding.severity),
): LegacyCertificationFinding {
  return {
    code: finding.ruleCode,
    severity,
    entityType: finding.affectedRecords[0]?.sourceType,
    entityId: finding.affectedRecords[0]?.sourceId,
    affectedRecords: finding.affectedRecords,
  };
}

describe("live certification comparison", () => {
  it("classifies every legacy occurrence and never renders source identifiers", () => {
    const fixture = createAssessmentFixture("messy-books");
    const assessment = createFinancialAssessment({
      ...fixture,
      assessmentType: "migration_readiness",
      generatedAt: FIXTURE_GENERATED_AT,
    });
    const duplicatedFinding = assessment.findings.find(
      (finding) => finding.affectedRecords.length > 0,
    )!;
    const retainedFinding = assessment.findings.find(
      (finding) =>
        finding.issueKey !== duplicatedFinding.issueKey &&
        finding.affectedRecords.length > 0,
    )!;
    const decisionCode = assessment.decisions[0]!.evidence.map((evidence) =>
      evidence.label.startsWith("Deterministic rule ")
        ? evidence.label.slice("Deterministic rule ".length)
        : undefined,
    ).find((code): code is string => Boolean(code))!;

    const baseline = {
      summary: {
        score: 0,
        readiness: "blocked",
        errorCount: 5,
        warningCount: 1,
      },
      findings: [
        legacyFromFinding(duplicatedFinding),
        legacyFromFinding(duplicatedFinding),
        legacyFromFinding(retainedFinding),
        {
          code: decisionCode,
          severity: "error",
        },
        {
          code: "TRIAL_BALANCE_NOT_ZERO",
          severity: "error",
        },
        {
          code: "MISSING_ACCOUNT_REFERENCE",
          severity: "error",
          entityType: "invoice",
          entityId: "sensitive-source-id",
          affectedRecords: [
            {
              sourceType: "invoice",
              sourceId: "sensitive-source-id",
            },
          ],
        },
      ],
    } as const;

    const comparison = createCertificationComparison(baseline, assessment);
    expect(comparison.dispositions).toHaveLength(baseline.findings.length);
    expect(
      comparison.dispositions.slice(0, 2).map((row) => row.disposition),
    ).toEqual(["Merged", "Merged"]);
    expect(comparison.dispositions[2]!.disposition).toBe("Still Valid");
    expect(comparison.dispositions[3]!.disposition).toBe("Reclassified");
    expect(comparison.dispositions[4]!.disposition).toBe("Reclassified");
    expect(comparison.dispositions[5]).toMatchObject({
      disposition: "Removed",
      manualReviewRequired: false,
    });
    expect(comparison.duplicateOccurrenceReduction).toBe(1);
    expect(comparison.newItems.length).toBeGreaterThan(0);

    const markdown = renderCertificationMarkdown(comparison);
    expect(markdown).toContain(
      "through ItemRef to the item's income or expense account",
    );
    expect(markdown).not.toContain("sensitive-source-id");
    for (const record of duplicatedFinding.affectedRecords) {
      expect(markdown).not.toContain(record.sourceId);
    }
  });

  it("marks unrecognized removed signals for manual evidence review", () => {
    const fixture = createAssessmentFixture("clean-company");
    const assessment = createFinancialAssessment({
      ...fixture,
      assessmentType: "migration_readiness",
      generatedAt: FIXTURE_GENERATED_AT,
    });
    const comparison = createCertificationComparison(
      {
        findings: [
          {
            code: "LEGACY_RULE_WITHOUT_CANONICAL_MATCH",
            severity: "warning",
          },
        ],
      },
      assessment,
    );
    expect(comparison.dispositions[0]).toMatchObject({
      disposition: "Removed",
      manualReviewRequired: true,
    });
    expect(comparison.dispositions[0]!.deterministicReason).toContain(
      "manual confirmation",
    );
  });
});
