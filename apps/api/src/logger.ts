import pino from "pino";
import type { AppEnv } from "./env.js";

export function createLogger(env: Pick<AppEnv, "LOG_LEVEL" | "NODE_ENV">) {
  return pino({
    level: env.LOG_LEVEL,
    redact: [
      "req.headers.authorization",
      "token",
      "accessToken",
      "refreshToken",
      "INTUIT_CLIENT_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
    transport:
      env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  });
}
