import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export function getTelegramSupabase(): SupabaseClient {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY required for Telegram bot");
  }
  return admin;
}
