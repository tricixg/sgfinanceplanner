import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { applyFundTransaction } from "@/lib/funds/ledger";
import { loadFundsBundle } from "@/lib/funds/load";
import type { Fund } from "@/lib/funds/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, funds: [], totals: null });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const supabase = await createAuthedSupabaseClient();
    const bundle = await loadFundsBundle(supabase, user.id);
    return NextResponse.json({ configured: true, ...bundle });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load funds";
    console.error("[api/funds] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PutBody = { funds?: Partial<Fund>[] };

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
  const incoming = body.funds ?? [];

  const { data: existing } = await supabase
    .from("investment_funds")
    .select("id")
    .eq("user_id", user.id);

  const keepIds = new Set(
    incoming.map((f) => f.id).filter((id): id is string => Boolean(id && UUID_RE.test(id)))
  );

  for (const row of existing ?? []) {
    if (!keepIds.has(row.id)) {
      await supabase.from("investment_funds").delete().eq("id", row.id);
    }
  }

  for (let i = 0; i < incoming.length; i++) {
    const f = incoming[i];
    const id = f.id && UUID_RE.test(f.id) ? f.id : null;

    if (id && keepIds.has(id)) {
      const { error } = await supabase
        .from("investment_funds")
        .update({
          name: f.name ?? "",
          notes: f.notes ?? "",
          sort_order: f.sortOrder ?? i,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("[api/funds] update failed", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      continue;
    }

    const opening = typeof f.balance === "number" ? f.balance : 0;
    const { data: row, error } = await supabase
      .from("investment_funds")
      .insert({
        user_id: user.id,
        name: f.name ?? "New fund",
        balance: 0,
        notes: f.notes ?? "",
        sort_order: f.sortOrder ?? i,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[api/funds] insert failed", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (opening !== 0 && row?.id) {
      await applyFundTransaction(supabase, {
        userId: user.id,
        fundId: row.id,
        amount: opening,
        kind: "deposit",
        note: "Opening balance",
      });
    }
  }

  console.info("[api/funds] PUT ok", { userId: user.id, count: incoming.length });
  const bundle = await loadFundsBundle(supabase, user.id);
  return NextResponse.json({ configured: true, ...bundle });
}
