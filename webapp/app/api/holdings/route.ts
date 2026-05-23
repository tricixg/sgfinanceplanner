import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadHoldings, saveHoldings } from "@/lib/holdings/load";
import type { Holding } from "@/lib/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, holdings: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  try {
    const supabase = await createAuthedSupabaseClient();
    const holdings = await loadHoldings(supabase, auth.user.id);
    return NextResponse.json({ configured: true, holdings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load holdings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  let body: { holdings?: Holding[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const supabase = await createAuthedSupabaseClient();
    const holdings = await saveHoldings(supabase, auth.user.id, body.holdings ?? []);
    return NextResponse.json({ configured: true, holdings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save holdings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
