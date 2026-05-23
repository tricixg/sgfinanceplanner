import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { applyTransaction } from "@/lib/savings/ledger";
import { loadAccountsBundle } from "@/lib/savings/load-accounts";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import type { UserSavingsAccount } from "@/lib/savings/types";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, accounts: [], totals: null });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const supabase = await createAuthedSupabaseClient();
    const bundle = await loadAccountsBundle(supabase, user.id);
    return NextResponse.json({ configured: true, ...bundle });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load accounts";
    console.error("[api/accounts] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PutBody = { accounts?: Partial<UserSavingsAccount>[] };

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
  const incoming = body.accounts ?? [];

  const { data: existing } = await supabase
    .from("user_savings_accounts")
    .select("id")
    .eq("user_id", user.id);

  const keepIds = new Set(
    incoming.map((a) => a.id).filter((id): id is string => Boolean(id && UUID_RE.test(id)))
  );

  for (const row of existing ?? []) {
    if (!keepIds.has(row.id)) {
      await supabase.from("user_savings_accounts").delete().eq("id", row.id);
    }
  }

  for (let i = 0; i < incoming.length; i++) {
    const a = incoming[i];
    const id = a.id && UUID_RE.test(a.id) ? a.id : null;

    if (id && keepIds.has(id)) {
      const { error } = await supabase
        .from("user_savings_accounts")
        .update({
          name: a.name ?? "",
          notes: a.notes ?? "",
          include_in_savings: a.includeInSavings !== false,
          sort_order: a.sortOrder ?? i,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("[api/accounts] update failed", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      continue;
    }

    const opening = typeof a.balance === "number" ? a.balance : 0;
    const { data: row, error } = await supabase
      .from("user_savings_accounts")
      .insert({
        user_id: user.id,
        name: a.name ?? "New account",
        balance: 0,
        notes: a.notes ?? "",
        include_in_savings: a.includeInSavings !== false,
        sort_order: a.sortOrder ?? i,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[api/accounts] insert failed", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (opening !== 0 && row?.id) {
      await applyTransaction(supabase, {
        userId: user.id,
        accountId: row.id,
        amount: opening,
        kind: "adjustment",
        note: "Opening balance",
      });
    }
  }

  console.info("[api/accounts] PUT ok", { userId: user.id, count: incoming.length });
  const bundle = await loadAccountsBundle(supabase, user.id);
  return NextResponse.json({ configured: true, ...bundle });
}
