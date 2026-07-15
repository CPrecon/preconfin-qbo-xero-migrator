import { createMigrationPlan } from "@preconfin/migration-engine";
import { validateMigration } from "@preconfin/validation-engine";
import { accountingFixture } from "./accounting-fixture.test-helper.js";
import { generateMigrationHealthPdf } from "./index.js";

export default {
  async fetch(): Promise<Response> {
    const snapshot = accountingFixture();
    const plan = createMigrationPlan(snapshot);
    const validation = validateMigration(snapshot, plan);
    const pdf = await generateMigrationHealthPdf({
      snapshot,
      plan,
      validation,
    });

    return new Response(new Uint8Array(pdf), {
      headers: { "content-type": "application/pdf" },
    });
  },
};
