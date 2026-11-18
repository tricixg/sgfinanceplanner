import { createClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

let redirecting = false;

/** Same-origin app API call (the only 401s that mean "your session is no good"). */
export function isAppApiRequest(input: RequestInfo | URL): boolean {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (raw.startsWith("/api/")) return true;
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(raw, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

/**
 * An app API answered 401: the browser's session is missing, expired or rejected. Drop the stale
 * local session (so it can't bounce us again) and send the user to sign in, then back here.
 * Runs once per page load; never on the sign-in pages themselves or in dev-bypass mode.
 */
export function handleUnauthorized(): void {
  if (typeof window === "undefined" || redirecting) return;
  if (process.env.NEXT_PUBLIC_AUTH_BYPASS_DEV === "true") return;
  const { pathname, search } = window.location;
  if (pathname.startsWith("/login") || pathname.startsWith("/auth")) return;
  redirecting = true;
  const next = encodeURIComponent(`${pathname}${search}`);
  console.info("[auth] API returned 401 — redirecting to login");
  const go = () => window.location.replace(`/login?next=${next}`);
  if (!isSupabaseAuthConfigured()) return go();
  createClient()
    .auth.signOut({ scope: "local" })
    .catch(() => undefined)
    .finally(go);
}

/** Test hook. */
export function resetUnauthorizedGuardForTests(): void {
  redirecting = false;
}
