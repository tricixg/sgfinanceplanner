import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  const finalResponse = NextResponse.next({ request: { headers } });
  supabaseResponse.cookies.getAll().forEach((cookie) => finalResponse.cookies.set(cookie));
  return finalResponse;
}
