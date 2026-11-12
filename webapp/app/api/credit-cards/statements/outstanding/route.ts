import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadOutstandingStatements } from "@/lib/credit-cards/card-statements/load";
import { loadCreditCards } from "@/lib/credit-cards/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ statements: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  try {
    const supabase = await createAuthedSupabaseClient();
    const cards = await loadCreditCards(supabase, auth.user.id);
    const statements = await loadOutstandingStatements(supabase, auth.user.id, cards);

    console.info("[api/credit-cards/statements/outstanding] GET", {
      userId: auth.user.id,
      statements: statements.length,
    });

    return NextResponse.json({ statements });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load outstanding statements";
    console.error("[api/credit-cards/statements/outstanding] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
