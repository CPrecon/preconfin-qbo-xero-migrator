import { createMigrationPlan } from "@preconfin/migration-engine";
import { createFinancialAssessment } from "@preconfin/financial-assessment-engine";
import { validateMigration } from "@preconfin/validation-engine";
import { accountingFixture } from "./accounting-fixture.test-helper.js";
import { generateMigrationHealthPdf } from "./index.js";

export default {
  async fetch(): Promise<Response> {
    const snapshot = accountingFixture();
    const plan = createMigrationPlan(snapshot);
    const assessment = createFinancialAssessment({
      snapshot,
      plan,
      assessmentType: "migration_readiness",
      generatedAt: "2026-06-30T12:00:00.000Z",
    });
    const validation = validateMigration(snapshot, plan);
    const pdf = await generateMigrationHealthPdf({
      snapshot,
      plan,
      validation,
      assessment,
    });

    return new Response(new Uint8Array(pdf), {
      headers: { "content-type": "application/pdf" },
    });
  },
};
