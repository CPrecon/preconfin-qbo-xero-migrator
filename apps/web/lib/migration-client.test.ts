import { describe, expect, it, vi } from "vitest";
import {
  createAndRunMigration,
  createInFlightGuard,
  migrationErrorMessage,
  type MigrationDiagnostic,
} from "./migration-client";

const jobId = "24319db9-6ef1-4116-ae66-1d4743b998bf";
const jobToken = "migration-token-returned-by-create";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("migration client handoff", () => {
  it("uses the job token returned by create-job for the immediate run request", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ jobId, jobToken, status: "queued" }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ score: 92, readiness: "ready_with_warnings" }),
      );

    const response = await createAndRunMigration({
      apiUrl: "https://api-migrate.preconfin.com",
      connectionId: "08305f01-4eb9-483c-9367-54e85ec351f0",
      connectionToken: "connection-token",
      fetchImpl,
      correlationId: "correlation-1",
      diagnostic: () => undefined,
    });

    expect(response.created).toMatchObject({ jobId, jobToken });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      `https://api-migrate.preconfin.com/api/migration-jobs/${jobId}/run`,
    );
    expect(fetchImpl.mock.calls[1]?.[1]?.headers).toEqual({
      "x-migration-token": jobToken,
    });
  });

  it("passes the sanitized assessment report through without recomputing scores", async () => {
    const report = {
      readiness: {
        state: "ready_with_review",
        label: "Ready with Review",
        explanation: "Review mappings.",
      },
      scores: {
        financialHealth: 98,
        migrationReadiness: 84,
        manualReviewRequired: 2,
      },
      summary: {
        primaryRecommendation: "Review mappings.",
        blockingIssueCount: 0,
        actionRequiredCount: 0,
        reviewItemCount: 2,
      },
      controls: [],
      recommendations: [],
      mappingReview: {
        automaticallyAccepted: 12,
        requiresReview: 2,
        excludedUnused: 5,
        mappings: [],
      },
      nextSteps: [],
      supportRecommended: false,
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ jobId, jobToken }, 201))
      .mockResolvedValueOnce(
        jsonResponse({
          score: 84,
          readiness: "review_recommended",
          report,
        }),
      );

    const result = await createAndRunMigration({
      apiUrl: "https://api-migrate.preconfin.com",
      connectionId: "08305f01-4eb9-483c-9367-54e85ec351f0",
      connectionToken: "connection-token",
      fetchImpl,
      correlationId: "correlation-report",
      diagnostic: () => undefined,
    });

    expect(result.result.report).toEqual(report);
    expect(result.result.report?.scores.financialHealth).toBe(98);
  });

  it("does not call run when the create-job response has no token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ jobId, status: "queued" }, 201));

    await expect(
      createAndRunMigration({
        apiUrl: "https://api-migrate.preconfin.com",
        connectionId: "08305f01-4eb9-483c-9367-54e85ec351f0",
        connectionToken: "connection-token",
        fetchImpl,
        correlationId: "correlation-2",
        diagnostic: () => undefined,
      }),
    ).rejects.toMatchObject({ code: "MIGRATION_SESSION_INVALID" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("prevents concurrent submissions from issuing duplicate operations", async () => {
    const runOnce = createInFlightGuard();
    let finishFirst: (() => void) | undefined;
    const operation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );

    const first = runOnce(operation);
    const second = runOnce(operation);

    await expect(second).resolves.toBeUndefined();
    expect(operation).toHaveBeenCalledTimes(1);
    finishFirst?.();
    await first;
  });

  it("turns a missing-token API response into a recoverable UI message", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ jobId, jobToken }, 201))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: "Migration token required",
            code: "MIGRATION_TOKEN_REQUIRED",
          },
          401,
        ),
      );

    let error: unknown;
    try {
      await createAndRunMigration({
        apiUrl: "https://api-migrate.preconfin.com",
        connectionId: "08305f01-4eb9-483c-9367-54e85ec351f0",
        connectionToken: "connection-token",
        fetchImpl,
        correlationId: "correlation-3",
        diagnostic: () => undefined,
      });
    } catch (caught) {
      error = caught;
    }

    expect(migrationErrorMessage(error)).toBe(
      "We could not verify this migration session. Please retry the scan. If the problem continues, reconnect QuickBooks.",
    );
  });

  it("never includes the raw token in structured diagnostics", async () => {
    const diagnostics: MigrationDiagnostic[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ jobId, jobToken }, 201))
      .mockResolvedValueOnce(jsonResponse({ score: 92, readiness: "ready" }));

    await createAndRunMigration({
      apiUrl: "https://api-migrate.preconfin.com",
      connectionId: "08305f01-4eb9-483c-9367-54e85ec351f0",
      connectionToken: "connection-token",
      fetchImpl,
      correlationId: "correlation-4",
      diagnostic: (event) => diagnostics.push(event),
    });

    expect(JSON.stringify(diagnostics)).not.toContain(jobToken);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        stage: "run_request",
        jobId,
        tokenPresent: true,
        tokenLength: jobToken.length,
      }),
    );
  });
});
