import { NextResponse } from "next/server";
import { safeRelativeRedirectPath } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET(request: Request) {
  if (!isSupabaseAuthConfigured()) {
    console.warn("[auth/callback] Supabase not configured");
    return NextResponse.redirect(new URL("/login?auth=unconfigured", request.url));
  }

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRelativeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      console.info("[auth/callback] session established", { next });
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] exchange failed", error.message);
  } else {
    console.warn("[auth/callback] missing code param");
  }

  const failUrl = new URL("/login", request.url);
  failUrl.searchParams.set("auth", "error");
  const failNext = safeRelativeRedirectPath(searchParams.get("next"));
  if (failNext !== "/") {
    failUrl.searchParams.set("next", failNext);
  }
  return NextResponse.redirect(failUrl);
}
