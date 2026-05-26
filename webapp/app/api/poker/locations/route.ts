import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { listPokerLocations, upsertPokerLocation } from "@/lib/poker/locations";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const supabase = await createAuthedSupabaseClient();
  const items = await listPokerLocations(supabase, auth.user.id);
  console.info("[api/poker/locations] GET", { userId: auth.user.id, count: items.length });
  return NextResponse.json({ configured: true, items });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Location name is required" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  try {
    await upsertPokerLocation(supabase, auth.user.id, name);
    return NextResponse.json({ item: name });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save location";
    console.error("[api/poker/locations] POST failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
