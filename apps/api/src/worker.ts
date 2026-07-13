import { z } from "zod";
import { loadEnv, type AppEnv } from "./env.js";
import { createSupabase } from "./db/supabase.js";
import { decryptJson, encryptJson } from "./security/crypto.js";
import {
  createPkcePair,
  hashToken,
  randomToken,
  signState,
  verifySignedState,
} from "./security/tokens.js";
import type { IntuitTokens } from "./services/intuit-oauth.js";
import { IntuitOAuthClient } from "./services/intuit-oauth.js";
import { MigrationService } from "./services/migration-service.js";
import { Repository } from "./services/repository.js";

type WorkerBindings = Record<string, string | undefined>;

type WorkerContext = {
  env: AppEnv;
  repo: Repository;
  oauth: IntuitOAuthClient;
  migrationService: MigrationService;
};

let contextPromise: Promise<WorkerContext> | undefined;

async function context(envBindings: WorkerBindings): Promise<WorkerContext> {
  if (!contextPromise) {
    const env = loadEnv({ ...process.env, ...envBindings });
    const repo = new Repository(createSupabase(env));
    contextPromise = Promise.resolve({
      env,
      repo,
      oauth: new IntuitOAuthClient(env),
      migrationService: new MigrationService(env, repo),
    });
  }
  return contextPromise;
}

function corsHeaders(env: AppEnv, request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  const allowed = env.CORS_ORIGINS.split(",").map((item) => item.trim());
  if (origin && allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  headers.set("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,x-migration-token");
  return headers;
}

function json(
  body: unknown,
  status = 200,
  headers: Headers = new Headers(),
): Response {
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function tokenFromRequest(request: Request, url: URL): string | undefined {
  return (
    request.headers.get("x-migration-token") ??
    url.searchParams.get("token") ??
    undefined
  );
}

function safeReturnTo(returnTo: string | undefined, appUrl: string): string {
  if (!returnTo) return `${appUrl}/migrate`;
  const parsed = new URL(returnTo, appUrl);
  const allowed = new URL(appUrl);
  if (parsed.origin !== allowed.origin) return `${appUrl}/migrate`;
  return parsed.toString();
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: [],
        message: "Request body must be valid JSON",
      },
    ]);
  }
}

function healthResponse() {
  return {
    ok: true,
    service: "qbo-xero-migrator-api",
    timestamp: new Date().toISOString(),
  };
}

async function handleRequest(
  request: Request,
  ctx: WorkerContext,
): Promise<Response> {
  const { env, repo, oauth, migrationService } = ctx;
  const url = new URL(request.url);
  const path = url.pathname;

  if (
    request.method === "GET" &&
    (path === "/health" || path === "/api/health")
  ) {
    return json(healthResponse());
  }

  if (request.method === "GET" && path === "/api/oauth/qbo/start") {
    const returnTo = url.searchParams.get("returnTo") ?? undefined;
    const nonce = randomToken(24);
    const state = signState(nonce, env.OAUTH_STATE_SIGNING_SECRET);
    const pkce = createPkcePair();
    await repo.createOAuthState({
      nonce,
      returnTo: safeReturnTo(returnTo, env.PUBLIC_APP_URL),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      codeVerifier: pkce.codeVerifier,
    });
    await repo.audit("qbo_oauth_started", { nonceHash: hashToken(nonce) });
    return redirect(oauth.authorizationUrl(state, pkce.codeChallenge));
  }

  if (request.method === "GET" && path === "/api/oauth/qbo/callback") {
    const query = z
      .object({ code: z.string(), state: z.string(), realmId: z.string() })
      .parse(Object.fromEntries(url.searchParams.entries()));
    const nonce = verifySignedState(
      query.state,
      env.OAUTH_STATE_SIGNING_SECRET,
    );
    if (!nonce) return json({ error: "Invalid OAuth state" }, 400);
    const state = await repo.consumeOAuthState(nonce);
    if (!state) return json({ error: "OAuth state expired" }, 400);
    const tokens = await oauth.exchangeCode(
      query.code,
      query.realmId,
      state.codeVerifier,
    );
    const encryptedTokens = encryptJson(tokens, env.TOKEN_ENCRYPTION_KEY);
    const { connection, token } = await repo.createConnection({
      realmId: query.realmId,
      encryptedTokens,
    });
    await repo.audit("qbo_oauth_completed", {
      connectionId: connection.id,
      realmId: query.realmId,
    });
    const redirectUrl = new URL(state.returnTo);
    redirectUrl.searchParams.set("connectionId", connection.id);
    redirectUrl.searchParams.set("connectionToken", token);
    return redirect(redirectUrl.toString());
  }

  if (request.method === "POST" && path === "/api/oauth/qbo/disconnect") {
    const body = z
      .object({
        connectionId: z.string().uuid(),
        connectionToken: z.string().min(16),
      })
      .parse(await readJson(request));
    const connection = await repo.getConnection(
      body.connectionId,
      body.connectionToken,
    );
    if (!connection)
      return json({ error: "QuickBooks connection not found" }, 404);
    try {
      const tokens = decryptJson<IntuitTokens>(
        connection.encryptedTokens,
        env.TOKEN_ENCRYPTION_KEY,
      );
      await oauth.revoke(tokens.refreshToken);
    } catch (error) {
      console.warn("Intuit token revocation failed before local disconnect", {
        connectionId: connection.id,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
    await repo.deleteConnection(body.connectionId, body.connectionToken);
    await repo.audit("qbo_connection_deleted", {
      connectionId: body.connectionId,
    });
    return json({ ok: true });
  }

  if (request.method === "POST" && path === "/api/migration-jobs") {
    const body = z
      .object({
        connectionId: z.string().uuid(),
        connectionToken: z.string().min(16),
      })
      .parse(await readJson(request));
    const connection = await repo.getConnection(
      body.connectionId,
      body.connectionToken,
    );
    if (!connection)
      return json({ error: "QuickBooks connection not found" }, 404);
    const { job, token } = await repo.createJob(connection.id);
    await repo.audit("migration_job_created", {
      jobId: job.id,
      connectionId: connection.id,
    });
    return json({ jobId: job.id, jobToken: token, status: job.status }, 201);
  }

  const jobMatch = path.match(/^\/api\/migration-jobs\/([^/]+)(?:\/([^/]+))?$/);
  if (jobMatch) {
    const id = z.string().uuid().parse(jobMatch[1]);
    const action = jobMatch[2];
    const token = tokenFromRequest(request, url);
    if (!token) return json({ error: "Migration token required" }, 401);

    if (request.method === "POST" && action === "run") {
      return json(await migrationService.runJob(id, token));
    }

    if (request.method === "GET" && !action) {
      const job = await repo.getJob(id, token);
      if (!job) return json({ error: "Migration job not found" }, 404);
      return json({
        id: job.id,
        status: job.status,
        readinessScore: job.readinessScore,
        readinessStatus: job.readinessStatus,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      });
    }

    if (request.method === "GET" && action === "downloads") {
      const job = await repo.getJob(id, token);
      if (!job) return json({ error: "Migration job not found" }, 404);
      const artifacts = await repo.listArtifacts(job.id);
      const downloads = await Promise.all(
        artifacts.map(async (artifact) => ({
          id: artifact.id,
          kind: artifact.kind,
          contentType: artifact.contentType,
          sizeBytes: artifact.sizeBytes,
          expiresAt: artifact.expiresAt,
          url: await repo.signedArtifactUrl(
            env.SUPABASE_STORAGE_BUCKET,
            artifact.path,
            env.SIGNED_URL_TTL_SECONDS,
          ),
        })),
      );
      await repo.audit("migration_download_links_created", {
        jobId: job.id,
        count: downloads.length,
      });
      return json({ downloads });
    }

    if (request.method === "DELETE" && !action) {
      const artifacts = await repo.deleteJob(id, token);
      await repo.deleteArtifacts(env.SUPABASE_STORAGE_BUCKET, artifacts);
      await repo.audit("migration_job_deleted", {
        jobId: id,
        artifactCount: artifacts.length,
      });
      return json({ ok: true });
    }
  }

  if (request.method === "POST" && path === "/api/leads") {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().optional(),
        company: z.string().optional(),
        jobId: z.string().uuid().optional(),
        source: z.string().default("migration-report"),
      })
      .parse(await readJson(request));
    await repo.saveLead(body);
    await repo.audit("lead_captured", {
      jobId: body.jobId,
      source: body.source,
    });
    return json({ ok: true }, 201);
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(
    request: Request,
    envBindings: WorkerBindings,
  ): Promise<Response> {
    let ctx: WorkerContext;
    try {
      ctx = await context(envBindings);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Invalid environment configuration";
      return new Response(message, { status: 500 });
    }

    const headers = corsHeaders(ctx.env, request);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });

    try {
      const response = await handleRequest(request, ctx);
      headers.forEach((value, key) => response.headers.set(key, value));
      return response;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return json(
          { error: "Invalid request", issues: error.issues },
          400,
          headers,
        );
      }
      console.error("request failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      return json({ error: "Unexpected server error" }, 500, headers);
    }
  },
};
