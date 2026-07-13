import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

for (const path of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
]) {
  if (existsSync(path)) loadDotenv({ path });
}

const booleanFlag = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}, z.boolean());

const placeholderFragments = ["replace-with", "example", "your-", "changeme"];

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return placeholderFragments.some((fragment) => normalized.includes(fragment));
}

function isThirtyTwoByteBase64(value: string): boolean {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

function isLocalUrl(value: string): boolean {
  const url = new URL(value);
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.string().default("info"),
    PUBLIC_APP_URL: z.string().url(),
    PUBLIC_API_URL: z.string().url(),
    CORS_ORIGINS: z.string().default("http://localhost:3000"),
    INTUIT_CLIENT_ID: z.string().min(1),
    INTUIT_CLIENT_SECRET: z.string().min(1),
    INTUIT_REDIRECT_URI: z.string().url(),
    INTUIT_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    QBO_MINOR_VERSION: z.string().regex(/^\d+$/).default("75"),
    TOKEN_ENCRYPTION_KEY: z.string().min(1),
    OAUTH_STATE_SIGNING_SECRET: z.string().min(32),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_STORAGE_BUCKET: z.string().default("migration-artifacts"),
    ARTIFACT_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
    SIGNED_URL_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(86400)
      .default(3600),
    POSTHOG_KEY: z.string().optional(),
    POSTHOG_HOST: z.string().url().default("https://us.i.posthog.com"),
    XERO_CLIENT_ID: z.string().optional(),
    XERO_CLIENT_SECRET: z.string().optional(),
    XERO_TENANT_ID: z.string().optional(),
    LIVE_CERTIFICATION_MODE: booleanFlag.default(false),
  })
  .superRefine((env, ctx) => {
    if (isPlaceholder(env.TOKEN_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TOKEN_ENCRYPTION_KEY"],
        message: "must not use the placeholder value",
      });
    }
    if (!isThirtyTwoByteBase64(env.TOKEN_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TOKEN_ENCRYPTION_KEY"],
        message: "must be base64 for exactly 32 bytes",
      });
    }
    if (isPlaceholder(env.OAUTH_STATE_SIGNING_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OAUTH_STATE_SIGNING_SECRET"],
        message: "must not use the placeholder value",
      });
    }
    for (const key of [
      "INTUIT_CLIENT_ID",
      "INTUIT_CLIENT_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY",
    ] as const) {
      if (isPlaceholder(env[key])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "must not use a placeholder value",
        });
      }
    }

    if (!env.LIVE_CERTIFICATION_MODE) return;

    if (env.INTUIT_ENVIRONMENT !== "sandbox") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTUIT_ENVIRONMENT"],
        message: "must be sandbox for live certification",
      });
    }
    for (const key of ["PUBLIC_APP_URL", "PUBLIC_API_URL"] as const) {
      if (isLocalUrl(env[key])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "must be a staging HTTPS URL in live certification mode",
        });
      }
    }
    if (!env.INTUIT_REDIRECT_URI.startsWith(env.PUBLIC_API_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTUIT_REDIRECT_URI"],
        message: "must be under PUBLIC_API_URL in live certification mode",
      });
    }
    for (const key of [
      "POSTHOG_KEY",
      "XERO_CLIENT_ID",
      "XERO_CLIENT_SECRET",
      "XERO_TENANT_ID",
    ] as const) {
      if (!env[key] || isPlaceholder(env[key])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "is required for live certification mode",
        });
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    );
    this.name = "EnvValidationError";
  }
}

function issueMessage(issue: z.ZodIssue): string {
  const key = issue.path.join(".") || "environment";
  return `${key}: ${issue.message}`;
}

export function loadEnv(
  overrides: Record<string, string | undefined> = process.env,
): AppEnv {
  const result = envSchema.safeParse(overrides);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues.map(issueMessage));
  }
  return result.data;
}
