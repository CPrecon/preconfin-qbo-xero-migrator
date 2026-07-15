import { resolve } from "node:path";
import { createMigrationPlan } from "@preconfin/migration-engine";
import { validateMigration } from "@preconfin/validation-engine";
import { unstable_dev } from "wrangler";
import { describe, expect, it, vi } from "vitest";
import { accountingFixture } from "./accounting-fixture.test-helper.js";
import { generateMigrationHealthPdf } from "./index.js";

describe("generateMigrationHealthPdf", () => {
  it("generates a branded PDF artifact in Node", async () => {
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

  it("generates the complete report in the workerd runtime without filesystem globals", async () => {
    const worker = await unstable_dev(
      resolve("src/pdf-report.worker.test-helper.ts"),
      {
        bundle: true,
        compatibilityDate: "2026-07-01",
        compatibilityFlags: ["nodejs_compat"],
        local: true,
        logLevel: "none",
        persist: false,
        experimental: { disableExperimentalWarning: true },
      },
    );

    try {
      const response = await worker.fetch();
      const pdf = Buffer.from(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
      expect(pdf.length).toBeGreaterThan(1000);
    } finally {
      await worker.stop();
    }
  }, 30_000);

  it("does not log financial fixture data or secrets", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];

    try {
      const snapshot = accountingFixture();
      const plan = createMigrationPlan(snapshot);
      const validation = validateMigration(snapshot, plan);
      await generateMigrationHealthPdf({ snapshot, plan, validation });

      expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});
