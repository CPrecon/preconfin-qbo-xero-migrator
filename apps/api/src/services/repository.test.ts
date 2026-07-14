import { describe, expect, it } from "vitest";
import { hashToken } from "../security/tokens.js";
import { Repository, RepositoryError } from "./repository.js";

class FakeQuery {
  private filters = new Map<string, unknown>();
  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
    private readonly operation: "select" | "delete" = "select",
  ) {}

  select() {
    return this;
  }

  delete() {
    return new FakeQuery(this.db, this.table, "delete");
  }

  eq(key: string, value: unknown) {
    this.filters.set(key, value);
    return this;
  }

  order() {
    return this;
  }

  async insert() {
    if (this.table === "oauth_states" && this.db.oauthStateError) {
      return { error: this.db.oauthStateError };
    }
    return { error: null };
  }

  async maybeSingle() {
    if (this.table !== "migration_jobs") return { data: null, error: null };
    const matches =
      this.filters.get("id") === this.db.job.id &&
      this.filters.get("access_token_hash") === this.db.job.access_token_hash;
    return { data: matches ? this.db.job : null, error: null };
  }

  async then(resolve: (value: { error: null }) => void) {
    if (this.operation === "delete" && this.table === "migration_jobs") {
      this.db.deleted = true;
    }
    resolve({ error: null });
  }
}

class FakeSupabase {
  deleted = false;
  oauthStateError?: { code?: string; message?: string; status?: number };

  constructor(
    input: {
      oauthStateError?: { code?: string; message?: string; status?: number };
    } = {},
  ) {
    this.oauthStateError = input.oauthStateError;
  }

  readonly job = {
    id: "11111111-1111-4111-8111-111111111111",
    connection_id: "22222222-2222-4222-8222-222222222222",
    access_token_hash: hashToken("right-token"),
    status: "completed",
    readiness_score: 90,
    readiness_status: "ready",
    error_message: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

describe("Repository", () => {
  it("does not delete a job when the job token hash does not match", async () => {
    const supabase = new FakeSupabase();
    const repo = new Repository(supabase as any);
    const artifacts = await repo.deleteJob(supabase.job.id, "wrong-token");
    expect(artifacts).toEqual([]);
    expect(supabase.deleted).toBe(false);
  });

  it("wraps OAuth state insert failures with safe repository metadata", async () => {
    const supabase = new FakeSupabase({
      oauthStateError: {
        code: "42P01",
        message: 'relation "public.oauth_states" does not exist',
        status: 404,
      },
    });
    const repo = new Repository(supabase as any);

    await expect(
      repo.createOAuthState({
        nonce: "nonce",
        returnTo: "https://migrate.preconfin.com/migrate",
        expiresAt: "2026-01-01T00:10:00.000Z",
        codeVerifier: "verifier",
      }),
    ).rejects.toMatchObject({
      name: "RepositoryError",
      table: "oauth_states",
      operation: "insert",
      code: "42P01",
      sourceType: "Object",
      status: 404,
      keys: ["code", "message", "status"],
    } satisfies Partial<RepositoryError>);
  });
});
