import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadCreditCards } from "@/lib/credit-cards/load";
import {
  loadFinancialAccounts,
  syncCashFinancialAccounts,
  syncCreditCardFinancialAccountsFromRows,
} from "@/lib/financial-accounts/sync";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

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

    const cardRows = await loadCreditCards(supabase, user.id);
    if (cardRows.length) {
      await syncCreditCardFinancialAccountsFromRows(supabase, user.id, cardRows);
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
