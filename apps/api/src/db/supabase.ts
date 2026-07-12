import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppEnv } from "../env.js";

export function createSupabase(env: AppEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
