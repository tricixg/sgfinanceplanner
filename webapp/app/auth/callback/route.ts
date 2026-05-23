import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET(request: Request) {
  if (!isSupabaseAuthConfigured()) {
    console.warn("[auth/callback] Supabase not configured");
    return NextResponse.redirect(new URL("/?auth=unconfigured", request.url));
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

  return NextResponse.redirect(new URL("/?auth=error", request.url));
}
