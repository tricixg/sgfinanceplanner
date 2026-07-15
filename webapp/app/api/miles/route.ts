import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadMilesBundle } from "@/lib/miles/load";
import type { MilesBalance } from "@/lib/miles/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, balances: [], totals: null });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const supabase = await createAuthedSupabaseClient();
    const bundle = await loadMilesBundle(supabase, user.id);
    return NextResponse.json({ configured: true, ...bundle });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load miles";
    console.error("[api/miles] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PutBody = { balances?: Partial<MilesBalance>[] };

export async function PUT(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  const incoming = body.balances ?? [];

  const { data: existing } = await supabase
    .from("miles_balances")
    .select("id")
    .eq("user_id", user.id);

  const keepIds = new Set(
    incoming.map((b) => b.id).filter((id): id is string => Boolean(id && UUID_RE.test(id)))
  );

  for (const row of existing ?? []) {
    if (!keepIds.has(row.id)) {
      await supabase.from("miles_balances").delete().eq("id", row.id);
    }
  }

  for (let i = 0; i < incoming.length; i++) {
    const b = incoming[i];
    const id = b.id && UUID_RE.test(b.id) ? b.id : null;

    const payload = {
      name: b.name ?? "",
      points_balance: typeof b.pointsBalance === "number" ? b.pointsBalance : 0,
      expiring_amount: typeof b.expiringAmount === "number" ? b.expiringAmount : null,
      expiry_date: b.expiryDate ?? null,
      rates: b.rates ?? {},
      notes: b.notes ?? "",
      sort_order: b.sortOrder ?? i,
      updated_at: new Date().toISOString(),
    };

    if (id && keepIds.has(id)) {
      const { error } = await supabase
        .from("miles_balances")
        .update(payload)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("[api/miles] update failed", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      continue;
    }

    const { error } = await supabase
      .from("miles_balances")
      .insert({ ...payload, user_id: user.id });

    if (error) {
      console.error("[api/miles] insert failed", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  console.info("[api/miles] PUT ok", { userId: user.id, count: incoming.length });
  const bundle = await loadMilesBundle(supabase, user.id);
  return NextResponse.json({ configured: true, ...bundle });
}
