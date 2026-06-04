import type { SupabaseClient } from "@supabase/supabase-js";
import { isDevAuthBypass } from "@/lib/auth/dev-bypass";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * User-scoped Supabase client. In dev bypass mode uses service role (with DEV_USER_ID
 * filtering in routes) because there is no magic-link session cookie.
 */
export async function createAuthedSupabaseClient(): Promise<SupabaseClient> {
  if (
    process.env.AUTH_BYPASS_DEV?.trim() === "true" &&
    process.env.NODE_ENV === "production"
  ) {
    console.error(
      "[supabase] AUTH_BYPASS_DEV is set but ignored in production — use session auth"
    );
  }

  if (isDevAuthBypass()) {
    const admin = createAdminClient();
    if (!admin) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is required when AUTH_BYPASS_DEV=true"
      );
    }
    console.info("[supabase] authed client — service role (dev bypass)");
    return admin;
  }
  return createClient();
}
