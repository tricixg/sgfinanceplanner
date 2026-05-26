import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadCardCalendarCycles } from "@/lib/credit-cards/card-statements/calendar-load";
import { loadCardStatementsBundle } from "@/lib/credit-cards/card-statements/load";
import { loadCreditCards } from "@/lib/credit-cards/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET(req: NextRequest) {
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
    const { searchParams } = new URL(req.url);
    const ym = searchParams.get("ym")?.trim() ?? "";

    const supabase = await createAuthedSupabaseClient();
    const cards = await loadCreditCards(supabase, auth.user.id);
    const bundle = await loadCardStatementsBundle(
      supabase,
      auth.user.id,
      cards
    );

    const enteredAmounts = bundle.statements
      .map((s) => s.actualAmount)
      .filter((n): n is number => n != null && n > 0);

    let calendarCycles;
    if (/^\d{4}-\d{2}$/.test(ym)) {
      calendarCycles = await loadCardCalendarCycles(
        supabase,
        auth.user.id,
        cards,
        ym
      );
    }

    console.info("[api/credit-cards/statements] GET", {
      userId: auth.user.id,
      statements: bundle.statements.length,
      ym: ym || null,
      calendarCycles: calendarCycles?.length ?? 0,
    });

    return NextResponse.json({
      ...bundle,
      enteredStatementAmounts: enteredAmounts,
      ...(calendarCycles != null ? { calendarCycles } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load statements";
    console.error("[api/credit-cards/statements] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
