import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import {
  loadCreditCards,
  saveCreditCards,
} from "@/lib/credit-cards/load";
import {
  migrateCreditCardsFromDashboard,
  needsCreditCardsMigration,
} from "@/lib/credit-cards/migrate-from-dashboard";
import { toCreditCard } from "@/lib/credit-cards/mappers";
import { saveErrorStatus } from "@/lib/sync/save-error";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { isPersistedDashboardSnapshot } from "@/lib/validate-state";
import type { CreditCard, DashboardState } from "@/lib/types";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, cards: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const supabase = await createAuthedSupabaseClient();

    const { data: stateRow } = await supabase
      .from("dashboard_state")
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle();

    const raw = stateRow?.data;
    if (isPersistedDashboardSnapshot(raw) && (await needsCreditCardsMigration(supabase, user.id, raw))) {
      await migrateCreditCardsFromDashboard(
        supabase,
        user.id,
        raw as DashboardState
      );
    }

    const rows = await loadCreditCards(supabase, user.id);
    const cards = rows.map(toCreditCard);
    console.info("[api/credit-cards] GET", { userId: user.id, count: cards.length });
    return NextResponse.json({ configured: true, cards });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load credit cards";
    console.error("[api/credit-cards] GET failed", msg);
    return apiError("api/credit-cards", msg, { fallback: "Failed to load credit cards" });
  }
}

export async function PUT(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  let body: { cards?: CreditCard[]; deletedCardKeys?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    const cards = await saveCreditCards(
      supabase,
      auth.user.id,
      body.cards ?? [],
      body.deletedCardKeys
    );
    console.info("[api/credit-cards] PUT", { userId: auth.user.id, count: cards.length });
    return NextResponse.json({ configured: true, cards });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save credit cards";
    console.error("[api/credit-cards] PUT failed", msg);
    return apiError("api/credit-cards", msg, { status: saveErrorStatus(e), fallback: "Failed to save credit cards" });
  }
}
