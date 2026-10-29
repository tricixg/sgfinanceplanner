import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { applyRateToAllEntries, loadOncallBundle } from "@/lib/oncall/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: { dailyRate?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    await applyRateToAllEntries(supabase, user.id, Number(body.dailyRate));
    const bundle = await loadOncallBundle(supabase, user.id);
    return NextResponse.json(bundle);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update entries";
    console.error("[api/oncall/entries/apply-rate] POST failed", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
