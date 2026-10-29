import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadOncallBundle, saveOncallSettings } from "@/lib/oncall/load";
import type { OncallSettings } from "@/lib/oncall/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function PUT(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: { settings?: Partial<OncallSettings> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.settings) {
    return NextResponse.json({ error: "settings required" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    await saveOncallSettings(supabase, user.id, body.settings);
    const bundle = await loadOncallBundle(supabase, user.id);
    return NextResponse.json(bundle);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save settings";
    console.error("[api/oncall/settings] PUT failed", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
