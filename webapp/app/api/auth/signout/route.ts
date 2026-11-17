import { apiError } from "@/lib/api/api-error";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function POST() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ ok: true });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("[api/auth/signout] failed", error.message);
    return apiError("api/auth/signout", error);
  }

  console.info("[api/auth/signout] ok");
  return NextResponse.json({ ok: true });
}
