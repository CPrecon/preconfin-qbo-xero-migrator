import { EnvValidationError, loadEnv } from "./env.js";

type HealthPayload = {
  ok?: boolean;
  readiness?: {
    environment?: string;
    issues?: string[];
    oauthRedirectUriMatchesExpected?: boolean;
  };
  runtime?: {
    publicApiUrl?: string;
    intuitEnvironment?: string;
    storageBucket?: string;
    oauthCallbackPath?: string;
  };
};

function runtimeUrl(): string | undefined {
  const arg = process.argv.find((item) => item.startsWith("--runtime-url="));
  return arg?.slice("--runtime-url=".length) ?? process.env.RUNTIME_HEALTH_URL;
}

async function verifyRuntime(urlValue: string): Promise<void> {
  const healthUrl = new URL("/api/health", `${urlValue.replace(/\/+$/, "")}/`);
  const response = await fetch(healthUrl);
  const payload = (await response.json()) as HealthPayload;
  if (!response.ok || !payload.ok) {
    const issues = payload.readiness?.issues?.join("; ") || response.statusText;
    throw new Error(`Runtime environment validation failed: ${issues}`);
  }
  if (payload.readiness?.environment !== "configured") {
    throw new Error(
      "Runtime environment validation did not report configured.",
    );
  }
  if (payload.readiness.oauthRedirectUriMatchesExpected !== true) {
    throw new Error(
      "Runtime OAuth redirect URI does not match PUBLIC_API_URL.",
    );
  }
  console.log("Runtime environment is configured.");
  console.log(`Runtime API URL: ${payload.runtime?.publicApiUrl ?? "unknown"}`);
  console.log(
    `Intuit environment: ${payload.runtime?.intuitEnvironment ?? "unknown"}`,
  );
  console.log(`Storage bucket: ${payload.runtime?.storageBucket ?? "unknown"}`);
  console.log(
    `OAuth callback path: ${payload.runtime?.oauthCallbackPath ?? "unknown"}`,
  );
}

async function main(): Promise<void> {
  const url = runtimeUrl();
  if (url) {
    await verifyRuntime(url);
    return;
  }

  const env = loadEnv({ ...process.env, LIVE_CERTIFICATION_MODE: "true" });
  console.log("Local live certification environment is configured.");
  console.log(`Intuit environment: ${env.INTUIT_ENVIRONMENT}`);
  console.log(`QBO minor version: ${env.QBO_MINOR_VERSION}`);
  console.log(`Storage bucket: ${env.SUPABASE_STORAGE_BUCKET}`);
}

main().catch((error) => {
  if (error instanceof EnvValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
