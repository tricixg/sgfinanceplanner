import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

/** @deprecated Use isSupabaseAuthConfigured for app persistence. */
export function isSupabaseConfigured(): boolean {
  return isSupabaseAuthConfigured();
}
