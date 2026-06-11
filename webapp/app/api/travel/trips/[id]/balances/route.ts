import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { buildCompanionBalances, totalPendingReimbursement } from "@/lib/travel/balances";
import {
  listTripCompanions,
  listTripExpenses,
  listTripSettlements,
  loadTrip,
} from "@/lib/travel/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [], totalPending: 0 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const supabase = await createAuthedSupabaseClient();
  const trip = await loadTrip(supabase, auth.user.id, id);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [companions, expenses, settlements] = await Promise.all([
    listTripCompanions(supabase, auth.user.id, id),
    listTripExpenses(supabase, auth.user.id, trip),
    listTripSettlements(supabase, auth.user.id, id),
  ]);

  const items = buildCompanionBalances(companions, expenses, settlements);
  const totalPending = totalPendingReimbursement(items);

  return NextResponse.json({ items, totalPending });
}
