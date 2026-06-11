import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { addTripCompanion, listTripCompanions, loadTrip } from "@/lib/travel/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const supabase = await createAuthedSupabaseClient();
  const trip = await loadTrip(supabase, auth.user.id, id);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const items = await listTripCompanions(supabase, auth.user.id, id);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const supabase = await createAuthedSupabaseClient();
  const trip = await loadTrip(supabase, auth.user.id, id);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const item = await addTripCompanion(supabase, auth.user.id, id, name);
  return NextResponse.json({ item });
}
