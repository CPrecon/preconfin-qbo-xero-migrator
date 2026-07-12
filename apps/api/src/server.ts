import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { z } from "zod";
import type { AppEnv } from "./env.js";
import { createLogger } from "./logger.js";
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

function tokenFromRequest(request: any): string | undefined {
  const header = request.headers["x-migration-token"];
  if (typeof header === "string") return header;
  if (Array.isArray(header)) return header[0];
  const queryToken = request.query?.token;
  return typeof queryToken === "string" ? queryToken : undefined;
}

function safeReturnTo(returnTo: string | undefined, appUrl: string): string {
  if (!returnTo) return `${appUrl}/migrate`;
  const parsed = new URL(returnTo, appUrl);
  const allowed = new URL(appUrl);
  if (parsed.origin !== allowed.origin) return `${appUrl}/migrate`;
  return parsed.toString();
}

export async function buildServer(env: AppEnv) {
  const logger = createLogger(env);
  const app = Fastify({ loggerInstance: logger });
  const repo = new Repository(createSupabase(env));
  const oauth = new IntuitOAuthClient(env);
  const migrationService = new MigrationService(env, repo);

  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(",").map((item) => item.trim()),
    credentials: false,
  });
  await app.register(swagger, {
    openapi: {
      info: { title: "PreconFin QBO to Xero Migrator API", version: "0.1.0" },
      servers: [{ url: env.PUBLIC_API_URL }],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/documentation" });

  app.get("/health", async () => ({
    ok: true,
    service: "qbo-xero-migrator-api",
    timestamp: new Date().toISOString(),
  }));

  app.get("/api/oauth/qbo/start", async (request, reply) => {
    const query = z
      .object({ returnTo: z.string().optional() })
      .parse(request.query);
    const nonce = randomToken(24);
    const state = signState(nonce, env.OAUTH_STATE_SIGNING_SECRET);
    const pkce = createPkcePair();
    await repo.createOAuthState({
      nonce,
      returnTo: safeReturnTo(query.returnTo, env.PUBLIC_APP_URL),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      codeVerifier: pkce.codeVerifier,
    });
    await repo.audit("qbo_oauth_started", { nonceHash: hashToken(nonce) });
    return reply.redirect(oauth.authorizationUrl(state, pkce.codeChallenge));
  });

  app.get("/api/oauth/qbo/callback", async (request, reply) => {
    const query = z
      .object({ code: z.string(), state: z.string(), realmId: z.string() })
      .parse(request.query);
    const nonce = verifySignedState(
      query.state,
      env.OAUTH_STATE_SIGNING_SECRET,
    );
    if (!nonce) return reply.code(400).send({ error: "Invalid OAuth state" });
    const state = await repo.consumeOAuthState(nonce);
    if (!state) return reply.code(400).send({ error: "OAuth state expired" });
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
    return reply.redirect(redirectUrl.toString());
  });

  app.post("/api/oauth/qbo/disconnect", async (request, reply) => {
    const body = z
      .object({
        connectionId: z.string().uuid(),
        connectionToken: z.string().min(16),
      })
      .parse(request.body);
    const connection = await repo.getConnection(
      body.connectionId,
      body.connectionToken,
    );
    if (!connection)
      return reply.code(404).send({ error: "QuickBooks connection not found" });
    try {
      const tokens = decryptJson<IntuitTokens>(
        connection.encryptedTokens,
        env.TOKEN_ENCRYPTION_KEY,
      );
      await oauth.revoke(tokens.refreshToken);
    } catch (error) {
      request.log.warn(
        { err: error, connectionId: connection.id },
        "Intuit token revocation failed before local disconnect",
      );
    }
    await repo.deleteConnection(body.connectionId, body.connectionToken);
    await repo.audit("qbo_connection_deleted", {
      connectionId: body.connectionId,
    });
    return reply.send({ ok: true });
  });

  app.post("/api/migration-jobs", async (request, reply) => {
    const body = z
      .object({
        connectionId: z.string().uuid(),
        connectionToken: z.string().min(16),
      })
      .parse(request.body);
    const connection = await repo.getConnection(
      body.connectionId,
      body.connectionToken,
    );
    if (!connection)
      return reply.code(404).send({ error: "QuickBooks connection not found" });
    const { job, token } = await repo.createJob(connection.id);
    await repo.audit("migration_job_created", {
      jobId: job.id,
      connectionId: connection.id,
    });
    return reply
      .code(201)
      .send({ jobId: job.id, jobToken: token, status: job.status });
  });

  app.post("/api/migration-jobs/:id/run", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const token = tokenFromRequest(request);
    if (!token)
      return reply.code(401).send({ error: "Migration token required" });
    const result = await migrationService.runJob(params.id, token);
    return reply.send(result);
  });

  app.get("/api/migration-jobs/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const token = tokenFromRequest(request);
    if (!token)
      return reply.code(401).send({ error: "Migration token required" });
    const job = await repo.getJob(params.id, token);
    if (!job) return reply.code(404).send({ error: "Migration job not found" });
    return reply.send({
      id: job.id,
      status: job.status,
      readinessScore: job.readinessScore,
      readinessStatus: job.readinessStatus,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  });

  app.get("/api/migration-jobs/:id/downloads", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const token = tokenFromRequest(request);
    if (!token)
      return reply.code(401).send({ error: "Migration token required" });
    const job = await repo.getJob(params.id, token);
    if (!job) return reply.code(404).send({ error: "Migration job not found" });
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
    return reply.send({ downloads });
  });

  app.delete("/api/migration-jobs/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const token = tokenFromRequest(request);
    if (!token)
      return reply.code(401).send({ error: "Migration token required" });
    const artifacts = await repo.deleteJob(params.id, token);
    await repo.deleteArtifacts(env.SUPABASE_STORAGE_BUCKET, artifacts);
    await repo.audit("migration_job_deleted", {
      jobId: params.id,
      artifactCount: artifacts.length,
    });
    return reply.send({ ok: true });
  });

  app.post("/api/leads", async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().optional(),
        company: z.string().optional(),
        jobId: z.string().uuid().optional(),
        source: z.string().default("migration-report"),
      })
      .parse(request.body);
    await repo.saveLead(body);
    await repo.audit("lead_captured", {
      jobId: body.jobId,
      source: body.source,
    });
    return reply.code(201).send({ ok: true });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    if (error instanceof z.ZodError) {
      return reply
        .code(400)
        .send({ error: "Invalid request", issues: error.issues });
    }
    return reply.code(500).send({ error: "Unexpected server error" });
  });

  return app;
}
