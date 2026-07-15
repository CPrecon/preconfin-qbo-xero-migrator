import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createCertificationComparison,
  renderCertificationMarkdown,
  type LegacyCertificationReport,
} from "../src/certification.js";
import { parseFinancialAssessmentV1 } from "../src/index.js";

async function main(): Promise<void> {
  const [baselinePath, assessmentPath] = process.argv.slice(2);
  if (!baselinePath || !assessmentPath) {
    throw new Error(
      "Usage: npm run baseline:compare -- <legacy-validation.json> <financial-assessment-v1.json>",
    );
  }

  const invocationRoot = process.env.INIT_CWD ?? process.cwd();
  const baseline = JSON.parse(
    await readFile(resolve(invocationRoot, baselinePath), "utf8"),
  ) as LegacyCertificationReport;
  const assessment = parseFinancialAssessmentV1(
    JSON.parse(await readFile(resolve(invocationRoot, assessmentPath), "utf8")),
  );
  const comparison = createCertificationComparison(baseline, assessment);
  process.stdout.write(renderCertificationMarkdown(comparison));
}

await main();
