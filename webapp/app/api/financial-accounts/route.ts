import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import {
  loadFinancialAccounts,
  syncCashFinancialAccounts,
  syncCreditCardFinancialAccounts,
} from "@/lib/financial-accounts/sync";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { isPersistedDashboardSnapshot } from "@/lib/validate-state";
import type { CreditCard } from "@/lib/types";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, accounts: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const supabase = await createAuthedSupabaseClient();
    await syncCashFinancialAccounts(supabase, user.id);

    const { data: stateRow } = await supabase
      .from("dashboard_state")
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle();

    const raw = stateRow?.data;
    if (isPersistedDashboardSnapshot(raw) && Array.isArray((raw as { creditCards?: CreditCard[] }).creditCards)) {
      const cards = (raw as { creditCards: CreditCard[] }).creditCards;
      await syncCreditCardFinancialAccounts(supabase, user.id, cards);
    }

    const accounts = await loadFinancialAccounts(supabase, user.id);
    console.info("[api/financial-accounts] loaded", {
      userId: user.id,
      count: accounts.length,
    });
    return NextResponse.json({ configured: true, accounts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load accounts";
    console.error("[api/financial-accounts] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
