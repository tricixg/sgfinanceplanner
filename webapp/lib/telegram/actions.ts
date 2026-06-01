import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyFinancialAccount } from "@/lib/expenses/auto-payment";
import { isExpenseBudgetType, mapDbBudgetLine } from "@/lib/expenses/budget-match";
import { syncExpenseLedgerAfterCreate } from "@/lib/expenses/expense-ledger-api";
import { insertPokerSession, type PokerSessionBody } from "@/lib/poker/save-session";
import { pokerProfit } from "@/lib/poker/types";
import { mapExpense } from "@/lib/savings/db-mappers";
import { sgtNowTimeHms, sgtSpentAtToIso, sgtTodayYmd } from "@/lib/time/sgt";
import { parseTravelSpentAtInput } from "@/lib/travel/expense-input";
import { loadTrip } from "@/lib/travel/load";
import { formatTravelExpenseNote, TRAVEL_CATEGORY } from "@/lib/travel/notes";
import {
  findCategoryRemaining,
  loadMonthBudgetSummary,
} from "@/lib/telegram/budget";
import { currentYm } from "@/lib/finance/helpers";

export async function createManualExpense(
  supabase: SupabaseClient,
  userId: string,
  input: {
    budgetLineId: string;
    amount: number;
    note?: string;
    spentAt?: string;
    spentTime?: string;
    financialAccountId?: string | null;
  }
): Promise<{ ok: true; category: string; remaining: number } | { ok: false; error: string }> {
  const spentAt = input.spentAt ?? sgtTodayYmd();
  const spentTime = input.spentTime ?? sgtNowTimeHms();
  const occurredAt = sgtSpentAtToIso(spentAt, spentTime);

  const financialAccountId =
    input.financialAccountId === null || input.financialAccountId === ""
      ? null
      : input.financialAccountId
        ? String(input.financialAccountId)
        : null;

  if (financialAccountId) {
    const ok = await verifyFinancialAccount(supabase, userId, financialAccountId);
    if (!ok) return { ok: false, error: "Invalid cash account" };
  }

  const { data: budgetRows } = await supabase
    .from("budget_lines")
    .select("*")
    .eq("user_id", userId);

  const budgetLines = (budgetRows ?? []).map((r) => mapDbBudgetLine(r));
  const budgetLine = budgetLines.find((l) => l.id === input.budgetLineId);

  if (!budgetLine || !isExpenseBudgetType(budgetLine.lineType)) {
    return { ok: false, error: "Invalid budget category" };
  }

  const { data: row, error } = await supabase
    .from("expenses")
    .insert({
      user_id: userId,
      amount: input.amount,
      category: budgetLine.category,
      budget_line_id: input.budgetLineId,
      spent_at: spentAt,
      spent_time: spentTime,
      note: input.note ?? "",
      financial_account_id: financialAccountId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[telegram] createManualExpense failed", error.message);
    return { ok: false, error: error.message };
  }

  const expense = mapExpense(row);
  const ledgerSync = await syncExpenseLedgerAfterCreate(supabase, userId, expense, {
    occurredAt,
  });
  if (!ledgerSync.ok) {
    return { ok: false, error: ledgerSync.error };
  }

  const ym = currentYm();
  const summary = await loadMonthBudgetSummary(supabase, userId, ym);
  const remaining = findCategoryRemaining(summary, input.budgetLineId) ?? 0;

  console.info("[telegram] expense created", {
    userId,
    budgetLineId: input.budgetLineId,
    amount: input.amount,
    financialAccountId,
  });

  return { ok: true, category: budgetLine.category, remaining };
}

export async function createTravelExpense(
  supabase: SupabaseClient,
  userId: string,
  tripId: string,
  input: {
    amount: number;
    subCategory: string;
    note?: string;
    spentAt?: string;
    financialAccountId?: string | null;
  }
): Promise<{ ok: true; tripName: string } | { ok: false; error: string }> {
  const trip = await loadTrip(supabase, userId, tripId);
  if (!trip) return { ok: false, error: "Trip not found" };

  const financialAccountId =
    input.financialAccountId === null || input.financialAccountId === ""
      ? null
      : input.financialAccountId
        ? String(input.financialAccountId)
        : null;

  if (financialAccountId) {
    const ok = await verifyFinancialAccount(supabase, userId, financialAccountId);
    if (!ok) return { ok: false, error: "Invalid cash account" };
  }

  const { spentAt, spentTime } = parseTravelSpentAtInput(input.spentAt);
  const note = formatTravelExpenseNote(trip.name, input.subCategory, input.note);
  const occurredAt = sgtSpentAtToIso(spentAt, spentTime);

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: userId,
      amount: input.amount,
      category: TRAVEL_CATEGORY,
      budget_line_id: null,
      spent_at: spentAt,
      spent_time: spentTime,
      note,
      financial_account_id: financialAccountId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[telegram] createTravelExpense failed", error.message);
    return { ok: false, error: error.message };
  }

  const expense = mapExpense(data);
  const ledgerSync = await syncExpenseLedgerAfterCreate(supabase, userId, expense, {
    occurredAt,
  });
  if (!ledgerSync.ok) {
    return { ok: false, error: ledgerSync.error };
  }

  console.info("[telegram] travel expense created", {
    userId,
    tripId,
    amount: input.amount,
    subCategory: input.subCategory,
    financialAccountId,
  });

  return { ok: true, tripName: trip.name };
}

export async function createPokerSessionFromBot(
  supabase: SupabaseClient,
  userId: string,
  body: PokerSessionBody
): Promise<{ ok: true; profit: number } | { ok: false; error: string }> {
  const result = await insertPokerSession(supabase, userId, body);
  if ("error" in result) {
    return { ok: false, error: result.error };
  }
  return { ok: true, profit: pokerProfit(result.session) };
}
