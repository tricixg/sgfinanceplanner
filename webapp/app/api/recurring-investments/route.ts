import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import {
  loadRecurringInvestments,
  saveRecurringInvestments,
} from "@/lib/recurring/load";
import type { RecurringInvestment } from "@/lib/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const supabase = await createAuthedSupabaseClient();
  const items = await loadRecurringInvestments(supabase, user.id);
  return NextResponse.json({ configured: true, items });
}

export async function PUT(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: { items?: RecurringInvestment[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "items array required" }, { status: 400 });
  }

  if (body.items.some((item) => !item.fundId)) {
    return NextResponse.json(
      { error: "Every recurring invest item requires a fund" },
      { status: 400 }
    );
  }

  const supabase = await createAuthedSupabaseClient();

  const fundIds = [...new Set(body.items.map((item) => item.fundId))];
  const { data: ownedFunds, error: fundsErr } = await supabase
    .from("investment_funds")
    .select("id")
    .eq("user_id", user.id)
    .in("id", fundIds);

  if (fundsErr) {
    return NextResponse.json({ error: fundsErr.message }, { status: 500 });
  }
  const ownedFundIds = new Set((ownedFunds ?? []).map((f) => String(f.id)));
  if (fundIds.some((id) => !ownedFundIds.has(id))) {
    return NextResponse.json({ error: "Invalid fund" }, { status: 400 });
  }

  const items = await saveRecurringInvestments(supabase, user.id, body.items);
  console.info("[api/recurring-investments] PUT", { userId: user.id, count: items.length });
  return NextResponse.json({ items });
}
