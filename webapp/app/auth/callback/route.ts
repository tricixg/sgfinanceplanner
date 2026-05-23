import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET(request: Request) {
  if (!isSupabaseAuthConfigured()) {
    console.warn("[auth/callback] Supabase not configured");
    return NextResponse.redirect(new URL("/login?auth=unconfigured", request.url));
  }

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      console.info("[auth/callback] session established");
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] exchange failed", error.message);
  } else {
    console.warn("[auth/callback] missing code param");
  }

  const failNext = searchParams.get("next");
  const failUrl = new URL("/login", request.url);
  failUrl.searchParams.set("auth", "error");
  if (failNext?.startsWith("/") && !failNext.startsWith("//")) {
    failUrl.searchParams.set("next", failNext);
  }
  return NextResponse.redirect(failUrl);
}
