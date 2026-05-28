import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import {
  loadCardStatementAmountEntries,
  normalizeCardStatementAmountEntries,
} from "@/lib/credit-cards/card-statements/calendar-amounts";
import { loadCreditCards } from "@/lib/credit-cards/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

/** Lightweight data for This month calendar (no spend index / interest). */
export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({
      configured: false,
      entries: [],
    });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  try {
    const supabase = await createAuthedSupabaseClient();
    const cards = await loadCreditCards(supabase, auth.user.id);

    const rawEntries = await loadCardStatementAmountEntries(
      supabase,
      auth.user.id
    );
    const entries = normalizeCardStatementAmountEntries(rawEntries, cards);

    console.info("[api/credit-cards/calendar] GET", {
      userId: auth.user.id,
      entries: entries.length,
    });

    return NextResponse.json({
      configured: true,
      entries,
      cards: cards.map((c) => ({
        id: c.id,
        cardKey: c.cardKey,
        name: c.name,
        statementDay: c.statementDay,
        paymentDueDay: c.paymentDueDay,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load calendar data";
    console.error("[api/credit-cards/calendar] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
