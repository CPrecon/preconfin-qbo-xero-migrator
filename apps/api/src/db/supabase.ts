import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppEnv } from "../env.js";

export class SupabaseHttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "SupabaseHttpError";
  }
}

function sanitizeSupabaseBody(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/=\([^)]+\)/g, "=([redacted])")
    .slice(0, 500);
}

async function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.ok) return response;

  let message = response.statusText || "Supabase request failed";
  let code: string | undefined;
  try {
    const body = (await response.clone().json()) as {
      code?: unknown;
      error?: unknown;
      message?: unknown;
    };
    code = typeof body.code === "string" ? body.code : undefined;
    const bodyMessage =
      typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : undefined;
    if (bodyMessage) message = sanitizeSupabaseBody(bodyMessage);
  } catch {
    try {
      const text = sanitizeSupabaseBody(await response.clone().text());
      if (text) message = text;
    } catch {
      // Keep the HTTP status as the useful failure signal.
    }
  }

  throw new SupabaseHttpError(
    response.status,
    response.statusText,
    code,
    "Supabase HTTP request failed: " + message,
  );
}

export function createSupabase(env: AppEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: supabaseFetch },
  });
}
