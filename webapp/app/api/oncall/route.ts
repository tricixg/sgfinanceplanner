import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadOncallBundle } from "@/lib/oncall/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const supabase = await createAuthedSupabaseClient();
    const bundle = await loadOncallBundle(supabase, user.id);
    console.info("[api/oncall] GET", {
      userId: user.id,
      entries: bundle.entries.length,
      payments: bundle.payments.length,
    });
    return NextResponse.json({ configured: true, ...bundle });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load on-call tracker";
    console.error("[api/oncall] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
