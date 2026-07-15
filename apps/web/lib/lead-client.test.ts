import { describe, expect, it, vi } from "vitest";
import { LeadSubmissionError, submitLead } from "./lead-client.js";

function response(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("submitLead", () => {
  it("tracks a submission only after the API confirms persistence", async () => {
    const track = vi.fn();
    const result = await submitLead({
      apiUrl: "https://api-migrate.preconfin.com",
      payload: {
        email: "operator@example.com",
        source: "contact",
      },
      fetchImpl: vi.fn().mockResolvedValue(
        response({
          ok: true,
          persisted: true,
          notifications: { admin: "sent", confirmation: "sent" },
        }),
      ),
      track,
    });

    expect(result).toEqual({
      persisted: true,
      notifications: { admin: "sent", confirmation: "sent" },
    });
    expect(track).toHaveBeenCalledWith("migration_lead_submitted", {
      source: "contact",
      hasJob: false,
    });
  });

  it("keeps a persisted lead successful when either email is delayed", async () => {
    const result = await submitLead({
      apiUrl: "https://api-migrate.preconfin.com",
      payload: {
        email: "operator@example.com",
        source: "migration-package-download",
        jobId: "11111111-1111-4111-8111-111111111111",
      },
      fetchImpl: vi.fn().mockResolvedValue(
        response({
          ok: true,
          persisted: true,
          notifications: { admin: "failed", confirmation: "failed" },
        }),
      ),
      track: vi.fn(),
    });

    expect(result.persisted).toBe(true);
    expect(result.notifications.confirmation).toBe("failed");
  });

  it("does not track rejected submissions", async () => {
    const track = vi.fn();
    await expect(
      submitLead({
        apiUrl: "https://api-migrate.preconfin.com",
        payload: {
          email: "operator@example.com",
          source: "contact",
        },
        fetchImpl: vi
          .fn()
          .mockResolvedValue(response({ error: "failed" }, 500)),
        track,
      }),
    ).rejects.toBeInstanceOf(LeadSubmissionError);
    expect(track).not.toHaveBeenCalled();
  });

  it("rejects a nominal HTTP success unless persistence is explicitly confirmed", async () => {
    const track = vi.fn();
    await expect(
      submitLead({
        apiUrl: "https://api-migrate.preconfin.com",
        payload: {
          email: "operator@example.com",
          source: "contact",
        },
        fetchImpl: vi.fn().mockResolvedValue(response({ ok: false }, 200)),
        track,
      }),
    ).rejects.toBeInstanceOf(LeadSubmissionError);
    expect(track).not.toHaveBeenCalled();
  });

  it("accepts the previous successful response during a rolling deploy", async () => {
    const result = await submitLead({
      apiUrl: "https://api-migrate.preconfin.com",
      payload: {
        email: "operator@example.com",
        source: "contact",
      },
      fetchImpl: vi.fn().mockResolvedValue(response({ ok: true })),
      track: vi.fn(),
    });
    expect(result.notifications).toEqual({
      admin: "unknown",
      confirmation: "unknown",
    });
  });
});
