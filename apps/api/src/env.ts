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

const envSchema = z.object({
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
  TOKEN_ENCRYPTION_KEY: z.string().min(32),
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
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(
  overrides: Record<string, string | undefined> = process.env,
): AppEnv {
  return envSchema.parse(overrides);
}
