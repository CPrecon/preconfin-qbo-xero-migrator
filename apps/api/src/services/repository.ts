import type { SupabaseClient } from "@supabase/supabase-js";
import { hashToken, randomToken } from "../security/tokens.js";
import type {
  LeadDeliveryUpdate,
  LeadEmailKind,
  LeadRecord,
  LeadSubmission,
} from "./lead-service.js";

export interface OAuthStateRecord {
  nonce: string;
  returnTo: string;
  expiresAt: string;
  codeVerifier: string;
}

export interface ConnectionRecord {
  id: string;
  realmId: string;
  companyName?: string;
  encryptedTokens: string;
  tokenHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobRecord {
  id: string;
  connectionId: string;
  tokenHash: string;
  status: "queued" | "running" | "completed" | "failed";
  readinessScore?: number;
  readinessStatus?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactRecord {
  id: string;
  jobId: string;
  kind: "zip" | "pdf" | "json";
  path: string;
  contentType: string;
  sizeBytes: number;
  expiresAt?: string;
}

export class RepositoryError extends Error {
  constructor(
    readonly table: string,
    readonly operation: string,
    readonly code: string | undefined,
    readonly sourceType: string,
    readonly status: number | undefined,
    readonly statusText: string | undefined,
    readonly keys: string[],
    message: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

type SupabaseErrorLike = {
  code?: unknown;
  error?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
  msg?: unknown;
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
  statusText?: unknown;
};

function sanitizeRepositoryMessage(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/=\([^)]+\)/g, "=([redacted])")
    .slice(0, 500);
}

function errorSourceType(error: unknown): string {
  if (error instanceof Error) return error.name || "Error";
  return Object.prototype.toString.call(error).replace(/^\[object |\]$/g, "");
}

function errorKeys(error: unknown): string[] {
  if (!error || typeof error !== "object") return [];
  return Array.from(
    new Set([...Object.keys(error), ...Object.getOwnPropertyNames(error)]),
  )
    .sort()
    .slice(0, 12);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function throwRepositoryError(
  table: string,
  operation: string,
  error: unknown,
  response?: { status?: number; statusText?: string },
): never {
  const supabaseError = error as SupabaseErrorLike;
  const sourceType = errorSourceType(error);
  const keys = errorKeys(error);
  const status =
    optionalNumber(supabaseError.status) ??
    optionalNumber(supabaseError.statusCode);
  const statusText = optionalString(supabaseError.statusText);
  const message =
    sanitizeRepositoryMessage(
      error instanceof Error ? error.message : undefined,
    ) ??
    sanitizeRepositoryMessage(supabaseError.message) ??
    sanitizeRepositoryMessage(supabaseError.error) ??
    sanitizeRepositoryMessage(supabaseError.msg) ??
    sanitizeRepositoryMessage(supabaseError.details) ??
    sanitizeRepositoryMessage(statusText) ??
    (keys.length
      ? "Supabase error object keys: " + keys.join(",")
      : undefined) ??
    "unknown Supabase error";

  throw new RepositoryError(
    table,
    operation,
    optionalString(supabaseError.code),
    sourceType,
    status,
    statusText,
    keys,
    "Supabase " + operation + " failed for " + table + ": " + message,
  );
}
export class Repository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createOAuthState(record: OAuthStateRecord): Promise<void> {
    const result = await this.supabase.from("oauth_states").insert({
      nonce: record.nonce,
      return_to: record.returnTo,
      expires_at: record.expiresAt,
      code_verifier: record.codeVerifier,
    });
    if (result.error) {
      throwRepositoryError("oauth_states", "insert", result.error, result);
    }
  }

  async consumeOAuthState(nonce: string): Promise<OAuthStateRecord | null> {
    const { data, error } = await this.supabase
      .from("oauth_states")
      .delete()
      .eq("nonce", nonce)
      .gt("expires_at", new Date().toISOString())
      .select("nonce, return_to, expires_at, code_verifier")
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      nonce: data.nonce,
      returnTo: data.return_to,
      expiresAt: data.expires_at,
      codeVerifier: data.code_verifier,
    };
  }

  async createConnection(input: {
    realmId: string;
    companyName?: string;
    encryptedTokens: string;
  }): Promise<{ connection: ConnectionRecord; token: string }> {
    const token = randomToken();
    const tokenHash = hashToken(token);
    const { data, error } = await this.supabase
      .from("qbo_connections")
      .insert({
        realm_id: input.realmId,
        company_name: input.companyName,
        encrypted_tokens: input.encryptedTokens,
        access_token_hash: tokenHash,
      })
      .select(
        "id, realm_id, company_name, encrypted_tokens, access_token_hash, created_at, updated_at",
      )
      .single();
    if (error) throw error;
    return { connection: mapConnection(data), token };
  }

  async getConnection(
    id: string,
    token: string,
  ): Promise<ConnectionRecord | null> {
    const { data, error } = await this.supabase
      .from("qbo_connections")
      .select(
        "id, realm_id, company_name, encrypted_tokens, access_token_hash, created_at, updated_at",
      )
      .eq("id", id)
      .eq("access_token_hash", hashToken(token))
      .maybeSingle();
    if (error) throw error;
    return data ? mapConnection(data) : null;
  }

  async getConnectionById(id: string): Promise<ConnectionRecord | null> {
    const { data, error } = await this.supabase
      .from("qbo_connections")
      .select(
        "id, realm_id, company_name, encrypted_tokens, access_token_hash, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapConnection(data) : null;
  }

  async updateConnectionTokens(
    id: string,
    encryptedTokens: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("qbo_connections")
      .update({ encrypted_tokens: encryptedTokens })
      .eq("id", id);
    if (error) throw error;
  }

  async deleteConnection(id: string, token: string): Promise<void> {
    const { error } = await this.supabase
      .from("qbo_connections")
      .delete()
      .eq("id", id)
      .eq("access_token_hash", hashToken(token));
    if (error) throw error;
  }

  async createJob(
    connectionId: string,
  ): Promise<{ job: JobRecord; token: string }> {
    const token = randomToken();
    const tokenHash = hashToken(token);
    const { data, error } = await this.supabase
      .from("migration_jobs")
      .insert({
        connection_id: connectionId,
        access_token_hash: tokenHash,
        status: "queued",
      })
      .select(
        "id, connection_id, access_token_hash, status, readiness_score, readiness_status, error_message, created_at, updated_at",
      )
      .single();
    if (error) throw error;
    return { job: mapJob(data), token };
  }

  async getJob(id: string, token: string): Promise<JobRecord | null> {
    const { data, error } = await this.supabase
      .from("migration_jobs")
      .select(
        "id, connection_id, access_token_hash, status, readiness_score, readiness_status, error_message, created_at, updated_at",
      )
      .eq("id", id)
      .eq("access_token_hash", hashToken(token))
      .maybeSingle();
    if (error) throw error;
    return data ? mapJob(data) : null;
  }

  async updateJob(
    id: string,
    patch: Partial<
      Pick<
        JobRecord,
        "status" | "readinessScore" | "readinessStatus" | "errorMessage"
      >
    >,
  ): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (patch.status) payload.status = patch.status;
    if (patch.readinessScore !== undefined)
      payload.readiness_score = patch.readinessScore;
    if (patch.readinessStatus !== undefined)
      payload.readiness_status = patch.readinessStatus;
    if (patch.errorMessage !== undefined)
      payload.error_message = patch.errorMessage;
    const { error } = await this.supabase
      .from("migration_jobs")
      .update(payload)
      .eq("id", id);
    if (error) throw error;
  }

  async deleteJob(id: string, token: string): Promise<ArtifactRecord[]> {
    const job = await this.getJob(id, token);
    if (!job) return [];
    const artifacts = await this.listArtifacts(job.id);
    const { error } = await this.supabase
      .from("migration_jobs")
      .delete()
      .eq("id", id)
      .eq("access_token_hash", hashToken(token));
    if (error) throw error;
    return artifacts;
  }

  async uploadArtifact(input: {
    bucket: string;
    path: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    const { error } = await this.supabase.storage
      .from(input.bucket)
      .upload(input.path, input.body, {
        contentType: input.contentType,
        upsert: false,
      });
    if (error) throw error;
  }

  async createArtifact(
    input: Omit<ArtifactRecord, "id">,
  ): Promise<ArtifactRecord> {
    const { data, error } = await this.supabase
      .from("migration_artifacts")
      .insert({
        job_id: input.jobId,
        kind: input.kind,
        storage_path: input.path,
        content_type: input.contentType,
        size_bytes: input.sizeBytes,
        expires_at: input.expiresAt,
      })
      .select(
        "id, job_id, kind, storage_path, content_type, size_bytes, expires_at",
      )
      .single();
    if (error) throw error;
    return mapArtifact(data);
  }

  async listArtifacts(jobId: string): Promise<ArtifactRecord[]> {
    const { data, error } = await this.supabase
      .from("migration_artifacts")
      .select(
        "id, job_id, kind, storage_path, content_type, size_bytes, expires_at",
      )
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapArtifact);
  }

  async deleteArtifacts(
    bucket: string,
    artifacts: Array<Pick<ArtifactRecord, "path">>,
  ): Promise<void> {
    const paths = artifacts.map((artifact) => artifact.path).filter(Boolean);
    if (!paths.length) return;
    const { error } = await this.supabase.storage.from(bucket).remove(paths);
    if (error) throw error;
  }

  async signedArtifactUrl(
    bucket: string,
    path: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error) throw error;
    return data.signedUrl;
  }

  async saveLead(input: LeadSubmission): Promise<LeadRecord> {
    const result = await this.supabase
      .from("migration_leads")
      .insert({
        email: input.email,
        name: input.name,
        company: input.company,
        migration_job_id: input.jobId,
        source: input.source,
      })
      .select("id")
      .single();
    if (result.error) {
      throwRepositoryError("migration_leads", "insert", result.error, result);
    }
    return { id: result.data.id };
  }

  async updateLeadDelivery(
    leadId: string,
    kind: LeadEmailKind,
    update: LeadDeliveryUpdate,
  ): Promise<void> {
    const prefix = kind === "admin" ? "admin_email" : "confirmation_email";
    const result = await this.supabase
      .from("migration_leads")
      .update({
        [`${prefix}_status`]: update.status,
        [`${prefix}_attempted_at`]: update.attemptedAt,
        [`${prefix}_provider_message_id`]: update.providerMessageId ?? null,
        [`${prefix}_failure_code`]: update.failureCode ?? null,
      })
      .eq("id", leadId);
    if (result.error) {
      throwRepositoryError(
        "migration_leads",
        `update_${kind}_email`,
        result.error,
        result,
      );
    }
  }

  async audit(event: string, payload: Record<string, unknown>): Promise<void> {
    const result = await this.supabase
      .from("audit_events")
      .insert({ event, payload });
    if (result.error) {
      throwRepositoryError("audit_events", "insert", result.error, result);
    }
  }
}

function mapConnection(data: any): ConnectionRecord {
  return {
    id: data.id,
    realmId: data.realm_id,
    companyName: data.company_name ?? undefined,
    encryptedTokens: data.encrypted_tokens,
    tokenHash: data.access_token_hash,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function mapJob(data: any): JobRecord {
  return {
    id: data.id,
    connectionId: data.connection_id,
    tokenHash: data.access_token_hash,
    status: data.status,
    readinessScore: data.readiness_score ?? undefined,
    readinessStatus: data.readiness_status ?? undefined,
    errorMessage: data.error_message ?? undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function mapArtifact(data: any): ArtifactRecord {
  return {
    id: data.id,
    jobId: data.job_id,
    kind: data.kind,
    path: data.storage_path,
    contentType: data.content_type,
    sizeBytes: data.size_bytes,
    expiresAt: data.expires_at ?? undefined,
  };
}
