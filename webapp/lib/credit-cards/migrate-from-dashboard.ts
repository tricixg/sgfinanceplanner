import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardState } from "@/lib/types";
import { ensureCreditCardIds } from "@/lib/finance/card-linking";
import { saveCreditCards, loadCreditCards } from "@/lib/credit-cards/load";

export async function needsCreditCardsMigration(
  supabase: SupabaseClient,
  userId: string,
  data: unknown
): Promise<boolean> {
  const { count } = await supabase
    .from("credit_cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) > 0) return false;

  if (!data || typeof data !== "object") return false;
  const cards = (data as DashboardState).creditCards;
  return Array.isArray(cards) && cards.length > 0;
}

export async function migrateCreditCardsFromDashboard(
  supabase: SupabaseClient,
  userId: string,
  state: DashboardState
): Promise<void> {
  const cards = ensureCreditCardIds(state.creditCards ?? []);
  if (!cards.length) return;

  const existing = await loadCreditCards(supabase, userId);
  if (existing.length > 0) return;

  await saveCreditCards(supabase, userId, cards);
  console.info("[migrate] credit cards from dashboard", {
    userId,
    count: cards.length,
  });
}
