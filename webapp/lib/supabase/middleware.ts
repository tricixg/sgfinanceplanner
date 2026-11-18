import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { isDevAuthBypass } from "@/lib/auth/dev-bypass";
import {
  loginRedirectPath,
  requiresSignInRedirect,
  userFromClaims,
} from "@/lib/auth/proxy-session";
import {
  TRUSTED_USER_HEADER,
  encodeTrustedUser,
  getAuthHeaderSecret,
} from "@/lib/auth/trusted-header";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Verify the access token locally against the project's public signing keys (cached in
  // memory, so no Supabase Auth round-trip per request). If the token is about to expire this
  // refreshes the session first and sets the new cookies through setAll above. Projects still
  // on a legacy HS256 secret make supabase-js fall back to a network getUser() automatically,
  // so this is never less strict than getUser(): it verifies the signature and expiry, and
  // userFromClaims() only accepts an end-user ("authenticated") token.
  //
  // Trade-off: a session revoked on the server (sign-out elsewhere, banned user) stays valid
  // here until its access token expires (Supabase default: 1 hour), instead of being rejected
  // on the next request.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = userFromClaims(claimsData?.claims as Record<string, unknown> | undefined);

  // Forward the already-verified identity to Route Handlers so they don't have to make a
  // second network round-trip to Supabase Auth to re-verify the same JWT. The value is
  // HMAC-signed with AUTH_HEADER_SECRET; any client-supplied copy is always deleted/replaced
  // here, and route handlers additionally reject unsigned or wrongly signed values. If the
  // secret is not configured nothing is forwarded, and handlers do a live getUser() instead.
  const headers = new Headers(request.headers);
  headers.delete(TRUSTED_USER_HEADER);
  const secret = getAuthHeaderSecret();
  if (user && secret) {
    headers.set(TRUSTED_USER_HEADER, await encodeTrustedUser(user, secret));
  }

  // Signed-out visitors never get the app: send them to sign in before any JS is downloaded.
  // The proxy can't tell a link prefetch from a navigation (Next hides those headers from it),
  // which is fine now that checking costs no network call. API routes are not redirected —
  // they answer 401 themselves — and sign-in pages stay public.
  const { pathname, search } = request.nextUrl;
  if (!user && !isDevAuthBypass() && requiresSignInRedirect(pathname)) {
    const redirect = NextResponse.redirect(new URL(loginRedirectPath(pathname, search), request.url));
    supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  const finalResponse = NextResponse.next({ request: { headers } });
  supabaseResponse.cookies.getAll().forEach((cookie) => finalResponse.cookies.set(cookie));
  return finalResponse;
}
