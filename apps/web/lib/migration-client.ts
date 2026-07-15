export type MigrationRequestStage =
  "create_request" | "create_response" | "run_request" | "run_response";

export type MigrationDiagnostic = {
  correlationId: string;
  stage: MigrationRequestStage;
  jobId?: string;
  tokenPresent: boolean;
  tokenLength?: number;
  responseStatus?: number;
};

export type CreatedMigrationJob = {
  jobId: string;
  jobToken: string;
  status?: string;
};

export type MigrationRunResult = {
  score: number;
  readiness: string;
  report?: PublicMigrationAssessment;
};

type FetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

type FetchLike = (input: string, init?: FetchOptions) => Promise<Response>;

type CreateAndRunMigrationOptions = {
  apiUrl: string;
  connectionId: string;
  connectionToken: string;
  fetchImpl?: FetchLike;
  correlationId?: string;
  diagnostic?: (event: MigrationDiagnostic) => void;
  onCreated?: (job: CreatedMigrationJob) => void | Promise<void>;
};

const migrationSessionMessage =
  "We could not verify this migration session. Please retry the scan. If the problem continues, reconnect QuickBooks.";

export class MigrationClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly stage: MigrationRequestStage,
    readonly correlationId: string,
    readonly responseStatus?: number,
  ) {
    super(message);
    this.name = "MigrationClientError";
  }
}

export async function createAndRunMigration(
  options: CreateAndRunMigrationOptions,
): Promise<{
  created: CreatedMigrationJob;
  result: MigrationRunResult;
}> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const diagnostic = options.diagnostic ?? reportMigrationDiagnostic;
  const correlationId = options.correlationId ?? globalThis.crypto.randomUUID();

  diagnostic({
    correlationId,
    stage: "create_request",
    tokenPresent: false,
  });
  const createResponse = await fetchImpl(
    `${options.apiUrl}/api/migration-jobs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: options.connectionId,
        connectionToken: options.connectionToken,
      }),
    },
  );

  if (!createResponse.ok) {
    diagnostic({
      correlationId,
      stage: "create_response",
      tokenPresent: false,
      responseStatus: createResponse.status,
    });
    throw await responseError(createResponse, "create_response", correlationId);
  }

  const createdPayload = await readJsonObject(
    createResponse,
    "create_response",
    correlationId,
  );
  const jobId = stringValue(createdPayload.jobId);
  const jobToken = stringValue(createdPayload.jobToken);

  diagnostic({
    correlationId,
    stage: "create_response",
    jobId: jobId || undefined,
    tokenPresent: Boolean(jobToken),
    tokenLength: jobToken.length,
    responseStatus: createResponse.status,
  });

  if (!jobId || !jobToken) {
    throw new MigrationClientError(
      migrationSessionMessage,
      "MIGRATION_SESSION_INVALID",
      "create_response",
      correlationId,
      createResponse.status,
    );
  }

  const created: CreatedMigrationJob = {
    jobId,
    jobToken,
    status: stringValue(createdPayload.status) || undefined,
  };
  await options.onCreated?.(created);

  diagnostic({
    correlationId,
    stage: "run_request",
    jobId,
    tokenPresent: true,
    tokenLength: jobToken.length,
  });
  const runResponse = await fetchImpl(
    `${options.apiUrl}/api/migration-jobs/${jobId}/run`,
    {
      method: "POST",
      headers: { "x-migration-token": jobToken },
    },
  );

  diagnostic({
    correlationId,
    stage: "run_response",
    jobId,
    tokenPresent: true,
    tokenLength: jobToken.length,
    responseStatus: runResponse.status,
  });

  if (!runResponse.ok) {
    throw await responseError(runResponse, "run_response", correlationId);
  }

  const resultPayload = await readJsonObject(
    runResponse,
    "run_response",
    correlationId,
  );
  const score = resultPayload.score;
  const readiness = stringValue(resultPayload.readiness);
  if (typeof score !== "number" || !readiness) {
    throw new MigrationClientError(
      "The migration scan returned an incomplete result. Please retry the scan.",
      "MIGRATION_RESULT_INVALID",
      "run_response",
      correlationId,
      runResponse.status,
    );
  }

  const report = publicReportValue(resultPayload.report);
  if (resultPayload.report !== undefined && !report) {
    throw new MigrationClientError(
      "The migration scan returned an incomplete report. Please retry the scan.",
      "MIGRATION_REPORT_INVALID",
      "run_response",
      correlationId,
      runResponse.status,
    );
  }

  return { created, result: { score, readiness, report } };
}

function publicReportValue(
  value: unknown,
): PublicMigrationAssessment | undefined {
  if (!value || typeof value !== "object") return undefined;
  const report = value as Record<string, unknown>;
  if (
    !report.readiness ||
    typeof report.readiness !== "object" ||
    !report.scores ||
    typeof report.scores !== "object" ||
    !Array.isArray(report.controls) ||
    !Array.isArray(report.recommendations) ||
    !report.mappingReview ||
    typeof report.mappingReview !== "object" ||
    !Array.isArray(report.nextSteps)
  ) {
    return undefined;
  }
  return value as PublicMigrationAssessment;
}

export function createInFlightGuard() {
  let inFlight = false;

  return async function runOnce<T>(
    operation: () => Promise<T>,
  ): Promise<T | undefined> {
    if (inFlight) return undefined;
    inFlight = true;
    try {
      return await operation();
    } finally {
      inFlight = false;
    }
  };
}

export function migrationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Migration scan failed.";
}

export function reportMigrationDiagnostic(event: MigrationDiagnostic): void {
  console.info("migration_flow", event);
}

async function responseError(
  response: Response,
  stage: MigrationRequestStage,
  correlationId: string,
): Promise<MigrationClientError> {
  const payload = await readOptionalJsonObject(response);
  const code = stringValue(payload?.code);
  const apiMessage = stringValue(payload?.error);
  if (
    code === "MIGRATION_TOKEN_REQUIRED" ||
    apiMessage === "Migration token required"
  ) {
    return new MigrationClientError(
      migrationSessionMessage,
      "MIGRATION_TOKEN_REQUIRED",
      stage,
      correlationId,
      response.status,
    );
  }

  return new MigrationClientError(
    apiMessage || "Request failed. Please try again.",
    code || "MIGRATION_REQUEST_FAILED",
    stage,
    correlationId,
    response.status,
  );
}

async function readJsonObject(
  response: Response,
  stage: MigrationRequestStage,
  correlationId: string,
): Promise<Record<string, unknown>> {
  const payload = await readOptionalJsonObject(response);
  if (!payload) {
    throw new MigrationClientError(
      "The migration service returned an invalid response. Please retry the scan.",
      "MIGRATION_RESPONSE_INVALID",
      stage,
      correlationId,
      response.status,
    );
  }
  return payload;
}

async function readOptionalJsonObject(
  response: Response,
): Promise<Record<string, unknown> | undefined> {
  try {
    const payload: unknown = await response.json();
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
import type { PublicMigrationAssessment } from "@preconfin/financial-assessment-engine";
