import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export type HealthReport = {
  status: "ok" | "error";
  checks: { app: "ok"; database: "ok" | "error" | "not_configured" };
  latencyMs: number | null;
  time: string;
};

const DB_TIMEOUT_MS = 3000;

/** Anonymous, cookie-less client: the health check never sees a session. */
export function createHealthClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * App is up (we're running) + Supabase reachable: a HEAD count on an
 * RLS-protected table as anon — a real PostgREST → Postgres round trip that
 * returns no rows and no body. Never includes error text or user data.
 */
export async function runHealthCheck(
  client: SupabaseClient | null,
  now: () => number = Date.now
): Promise<HealthReport> {
  const time = new Date(now()).toISOString();
  if (!client) {
    return { status: "error", checks: { app: "ok", database: "not_configured" }, latencyMs: null, time };
  }

  const started = now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DB_TIMEOUT_MS);
  try {
    const { error } = await client
      .from("user_finance_profile")
      .select("user_id", { head: true, count: "exact" })
      .limit(1)
      .abortSignal(controller.signal);
    const latencyMs = now() - started;
    if (error) {
      console.error("[api/health] database check failed", { code: error.code, message: error.message });
      return { status: "error", checks: { app: "ok", database: "error" }, latencyMs, time };
    }
    return { status: "ok", checks: { app: "ok", database: "ok" }, latencyMs, time };
  } catch (e) {
    console.error("[api/health] database check threw", e instanceof Error ? e.message : String(e));
    return { status: "error", checks: { app: "ok", database: "error" }, latencyMs: now() - started, time };
  } finally {
    clearTimeout(timer);
  }
}
