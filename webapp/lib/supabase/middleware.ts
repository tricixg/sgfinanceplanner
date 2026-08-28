import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { TRUSTED_USER_HEADER, encodeTrustedUser } from "@/lib/auth/trusted-header";

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
  // second network round-trip to Supabase Auth to re-verify the same JWT. `headers` is
  // always set/cleared here, so any client-supplied copy of TRUSTED_USER_HEADER is replaced
  // before it reaches a Route Handler.
  const headers = new Headers(request.headers);
  if (user) {
    headers.set(TRUSTED_USER_HEADER, encodeTrustedUser(user));
  } else {
    headers.delete(TRUSTED_USER_HEADER);
  }
  const finalResponse = NextResponse.next({ request: { headers } });
  supabaseResponse.cookies.getAll().forEach((cookie) => finalResponse.cookies.set(cookie));
  return finalResponse;
}
