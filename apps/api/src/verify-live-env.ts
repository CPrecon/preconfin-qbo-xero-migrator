import { EnvValidationError, loadEnv } from "./env.js";

try {
  const env = loadEnv({ ...process.env, LIVE_CERTIFICATION_MODE: "true" });
  console.log("Live certification environment is configured.");
  console.log(`Intuit environment: ${env.INTUIT_ENVIRONMENT}`);
  console.log(`QBO minor version: ${env.QBO_MINOR_VERSION}`);
  console.log(`Storage bucket: ${env.SUPABASE_STORAGE_BUCKET}`);
} catch (error) {
  if (error instanceof EnvValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
