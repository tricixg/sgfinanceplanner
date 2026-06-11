import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { verifyFinancialAccount } from "@/lib/expenses/auto-payment";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import {
  createTripSettlement,
  listTripCompanions,
  listTripSettlements,
  loadTrip,
} from "@/lib/travel/load";
import { applyReceivedSettlementDeposit } from "@/lib/travel/settlement-ledger";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const supabase = await createAuthedSupabaseClient();
  const trip = await loadTrip(supabase, auth.user.id, id);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const items = await listTripSettlements(supabase, auth.user.id, id);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  let body: {
    companionId?: string;
    direction?: string;
    amount?: number;
    settledAt?: string;
    note?: string;
    financialAccountId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companionId = String(body.companionId ?? "").trim();
  const direction =
    body.direction === "paid"
      ? "paid"
      : body.direction === "received"
        ? "received"
        : null;
  const amount = Number(body.amount ?? NaN);
  const settledAt = String(body.settledAt ?? "").slice(0, 10);
  const financialAccountId = String(body.financialAccountId ?? "").trim();

  if (!companionId || !direction || !(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(settledAt)) {
    return NextResponse.json(
      { error: "companionId, direction (received|paid), amount, and settledAt required" },
      { status: 400 }
    );
  }

  const supabase = await createAuthedSupabaseClient();
  const trip = await loadTrip(supabase, auth.user.id, id);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const companions = await listTripCompanions(supabase, auth.user.id, id);
  if (!companions.some((c) => c.id === companionId)) {
    return NextResponse.json({ error: "Companion not on this trip" }, { status: 400 });
  }

  const syncLedger = direction === "received" && Boolean(financialAccountId);

  if (syncLedger) {
    const accountOk = await verifyFinancialAccount(
      supabase,
      auth.user.id,
      financialAccountId
    );
    if (!accountOk) {
      return NextResponse.json({ error: "Account not found" }, { status: 400 });
    }
  }

  const settlementNote =
    direction === "received" && syncLedger ? undefined : body.note?.trim() ?? "";

  let item = await createTripSettlement(supabase, auth.user.id, id, {
    companionId,
    direction,
    amount,
    settledAt,
    note: settlementNote,
    financialAccountId: syncLedger ? financialAccountId : null,
  });

  if (syncLedger) {
    try {
      const deposit = await applyReceivedSettlementDeposit(supabase, auth.user.id, {
        financialAccountId,
        tripName: trip.name,
        amount,
        settledAt,
      });

      const { data: updated, error: updErr } = await supabase
        .from("travel_companion_settlements")
        .update({
          note: deposit.note,
          savings_transaction_id: deposit.savingsTransactionId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("user_id", auth.user.id)
        .select("*")
        .single();

      if (updErr || !updated) {
        throw new Error(updErr?.message ?? "Failed to link deposit");
      }

      item = {
        ...item,
        note: deposit.note,
        savingsTransactionId: deposit.savingsTransactionId,
      };

      console.info("[travel/settlements] received settlement recorded with deposit", {
        tripId: id,
        settlementId: item.id,
        savingsTransactionId: deposit.savingsTransactionId,
        financialAccountId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deposit failed";
      console.error("[travel/settlements] deposit failed, rolling back settlement", {
        tripId: id,
        settlementId: item.id,
        message,
      });
      await supabase
        .from("travel_companion_settlements")
        .delete()
        .eq("id", item.id)
        .eq("user_id", auth.user.id);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } else if (direction === "received") {
    console.info("[travel/settlements] received settlement recorded without ledger", {
      tripId: id,
      settlementId: item.id,
    });
  }

  return NextResponse.json({ item });
}
