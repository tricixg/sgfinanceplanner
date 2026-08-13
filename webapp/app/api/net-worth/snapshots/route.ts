import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import {
  appendNetWorthSnapshot,
  loadNetWorthSnapshots,
} from "@/lib/net-worth/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import type { NetWorthSnapshot } from "@/lib/types";

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const limit = Math.min(
    120,
    Math.max(1, parseInt(new URL(req.url).searchParams.get("limit") ?? "60", 10) || 60)
  );

  try {
    const supabase = await createAuthedSupabaseClient();
    const items = await loadNetWorthSnapshots(supabase, auth.user.id, limit);
    return NextResponse.json({ configured: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load net worth history";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  let body: { snapshot?: NetWorthSnapshot };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const snap = body.snapshot;
  if (!snap?.month) {
    return NextResponse.json({ error: "snapshot required" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    await appendNetWorthSnapshot(supabase, auth.user.id, snap);
    console.info("[api/net-worth/snapshots] POST ok", {
      userId: auth.user.id,
      month: snap.month,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save net worth snapshot";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
