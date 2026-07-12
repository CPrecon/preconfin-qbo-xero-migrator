import { describe, expect, it } from "vitest";
import { createMigrationPlan } from "@preconfin/migration-engine";
import { validateMigration } from "@preconfin/validation-engine";
import { generateMigrationHealthPdf } from "./index.js";
import { accountingFixture } from "./accounting-fixture.test-helper.js";

describe("generateMigrationHealthPdf", () => {
  it("generates a branded PDF artifact", async () => {
    const snapshot = accountingFixture();
    const plan = createMigrationPlan(snapshot);
    const validation = validateMigration(snapshot, plan);
    const pdf = await generateMigrationHealthPdf({
      snapshot,
      plan,
      validation,
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
