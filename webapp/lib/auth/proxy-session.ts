/**
 * Pure helpers for the proxy's session handling (lib/supabase/middleware.ts).
 */

export type ProxyUser = {
  id: string;
  email: string | null;
  user_metadata: { has_password?: unknown } | null;
};

/**
 * The signed-in user from VERIFIED JWT claims (`supabase.auth.getClaims()`: signature checked
 * against the project's public signing keys, expiry checked). Anything that is not an
 * end-user access token — no subject, or a role other than "authenticated" (e.g. the anon
 * key) — is "not signed in".
 */
export function userFromClaims(claims: Record<string, unknown> | null | undefined): ProxyUser | null {
  if (!claims) return null;
  const sub = claims.sub;
  if (typeof sub !== "string" || !sub) return null;
  if (claims.role !== "authenticated") return null;
  const meta = claims.user_metadata;
  return {
    id: sub,
    email: typeof claims.email === "string" ? claims.email : null,
    user_metadata: meta && typeof meta === "object" ? (meta as { has_password?: unknown }) : null,
  };
}

/** Pages a signed-out visitor may see. Everything else outside /api is the signed-in app. */
export function isPublicPagePath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/")
  );
}

/** Page requests (not API calls) that need a signed-in user, so signed-out ones are redirected. */
export function requiresSignInRedirect(pathname: string): boolean {
  return !pathname.startsWith("/api/") && pathname !== "/api" && !isPublicPagePath(pathname);
}

/** `/login?next=<where they were going>`, same shape the client-side gate used. */
export function loginRedirectPath(pathname: string, search: string): string {
  return `/login?next=${encodeURIComponent(`${pathname}${search}`)}`;
}
