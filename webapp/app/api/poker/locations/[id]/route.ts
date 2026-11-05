import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { deletePokerLocation, updatePokerLocation } from "@/lib/poker/locations";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  let body: { name?: string; isOnline?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: { name?: string; isOnline?: boolean } = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Location name is required" }, { status: 400 });
    }
    updates.name = name;
  }
  if (body.isOnline !== undefined) {
    updates.isOnline = body.isOnline === true;
  }

  const supabase = await createAuthedSupabaseClient();
  try {
    const item = await updatePokerLocation(supabase, auth.user.id, id, updates);
    console.info("[api/poker/locations] PATCH ok", { id, userId: auth.user.id });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update location";
    const status = msg === "Location not found" ? 404 : 400;
    console.error("[api/poker/locations] PATCH failed", msg);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const supabase = await createAuthedSupabaseClient();
  try {
    await deletePokerLocation(supabase, auth.user.id, id);
    console.info("[api/poker/locations] DELETE ok", { id, userId: auth.user.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete location";
    const status = msg === "Location not found" ? 404 : 400;
    console.error("[api/poker/locations] DELETE failed", msg);
    return NextResponse.json({ error: msg }, { status });
  }
}
