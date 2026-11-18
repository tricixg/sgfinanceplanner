import { createClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export type ClientSessionUser = { id: string; email: string | null; hasPassword?: boolean };

/**
 * Who the browser is signed in as, read from the Supabase session cookie — no network round-trip
 * (unless the access token has expired, in which case supabase-js refreshes it).
 *
 * This is for UI gating only: choosing between "show the app" and "go to /login", and enabling
 * data fetches. It is NOT a security check. Every API route still verifies the session itself
 * (signed identity header from the proxy, else a live getUser()), so a stale or forged cookie
 * here only means the first API call answers 401, which sends the user to /login
 * (see lib/auth/unauthorized.ts).
 */
export async function readClientSession(): Promise<{
  configured: boolean;
  user: ClientSessionUser | null;
}> {
  if (!isSupabaseAuthConfigured()) return { configured: false, user: null };
  const { data, error } = await createClient().auth.getSession();
  if (error) throw new Error(error.message);
  const u = data.session?.user;
  if (!u) return { configured: true, user: null };
  return {
    configured: true,
    user: {
      id: u.id,
      email: u.email ?? null,
      hasPassword: Boolean(u.user_metadata?.has_password),
    },
  };
}
