import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import {
  appendPortfolioSnapshot,
  loadPortfolioSnapshots,
} from "@/lib/holdings/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import type { PortfolioSnapshot } from "@/lib/types";

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const limit = Math.min(
    100,
    Math.max(1, parseInt(new URL(req.url).searchParams.get("limit") ?? "24", 10) || 24)
  );

  try {
    const supabase = await createAuthedSupabaseClient();
    const items = await loadPortfolioSnapshots(supabase, auth.user.id, limit);
    return NextResponse.json({ configured: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load snapshots";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  let body: { snapshot?: PortfolioSnapshot };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const snap = body.snapshot;
  if (!snap?.recordedAt) {
    return NextResponse.json({ error: "snapshot required" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    await appendPortfolioSnapshot(supabase, auth.user.id, snap);
    console.info("[api/portfolio/snapshots] POST ok", {
      userId: auth.user.id,
      recordedAt: snap.recordedAt,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save snapshot";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
