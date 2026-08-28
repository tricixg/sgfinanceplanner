/**
 * Carries the identity middleware already verified via `supabase.auth.getUser()` down to
 * Route Handlers, so they don't need to re-verify the JWT against Supabase Auth on every
 * request. Middleware unconditionally sets or clears this header on every matched request,
 * so a client-supplied copy of the same header name is always overwritten before it reaches
 * a Route Handler — see `lib/supabase/middleware.ts` and `lib/auth/require-user.ts`.
 */
export const TRUSTED_USER_HEADER = "x-sgfp-verified-user";

export type TrustedUser = {
  id: string;
  email: string | null;
  hasPassword: boolean;
};

export function encodeTrustedUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: { has_password?: unknown } | null;
}): string {
  const payload: TrustedUser = {
    id: user.id,
    email: user.email ?? null,
    hasPassword: Boolean(user.user_metadata?.has_password),
  };
  return JSON.stringify(payload);
}

export function decodeTrustedUser(headerValue: string | null): TrustedUser | null {
  if (!headerValue) return null;
  try {
    const parsed = JSON.parse(headerValue);
    if (typeof parsed?.id !== "string") return null;
    return {
      id: parsed.id,
      email: typeof parsed.email === "string" ? parsed.email : null,
      hasPassword: Boolean(parsed.hasPassword),
    };
  } catch {
    return null;
  }
}
