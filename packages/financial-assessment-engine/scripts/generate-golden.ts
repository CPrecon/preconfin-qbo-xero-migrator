import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createFinancialAssessment } from "../src/engine.js";
import { stableStringify } from "../src/stable.js";
import {
  createAssessmentFixture,
  FIXTURE_GENERATED_AT,
  FIXTURE_NAMES,
} from "../test/fixture-factory.js";

const root = resolve(import.meta.dirname, "..", "fixtures");

for (const name of FIXTURE_NAMES) {
  const fixture = createAssessmentFixture(name);
  const assessment = createFinancialAssessment({
    ...fixture,
    assessmentType: "migration_readiness",
    generatedAt: FIXTURE_GENERATED_AT,
  });
  const directory = resolve(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "financial-assessment-v1.json"),
    stableStringify(assessment, 2) + "\n",
    "utf8",
  );
}
