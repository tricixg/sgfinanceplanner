import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadCardStatementsBundle } from "@/lib/credit-cards/card-statements/load";
import { loadCreditCards } from "@/lib/credit-cards/load";
import {
  syncCashFinancialAccounts,
  syncCreditCardFinancialAccountsFromRows,
} from "@/lib/financial-accounts/sync";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({
      configured: false,
      statements: [],
      openCycles: [],
    });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  try {
    const supabase = await createAuthedSupabaseClient();
    await syncCashFinancialAccounts(supabase, auth.user.id);
    const cards = await loadCreditCards(supabase, auth.user.id);
    if (cards.length) {
      await syncCreditCardFinancialAccountsFromRows(supabase, auth.user.id, cards);
    }
    const bundle = await loadCardStatementsBundle(
      supabase,
      auth.user.id,
      cards
    );
    console.info("[api/credit-cards/statements] GET", {
      userId: auth.user.id,
      statements: bundle.statements.length,
    });
    return NextResponse.json(bundle);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load statements";
    console.error("[api/credit-cards/statements] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
