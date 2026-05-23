import type { SupabaseClient } from "@supabase/supabase-js";
import type { Loan } from "@/lib/types";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function loadLoans(
  supabase: SupabaseClient,
  userId: string
): Promise<Loan[]> {
  const { data, error } = await supabase
    .from("loans")
    .select("*, credit_cards(card_key)")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const cc = row.credit_cards as { card_key?: string } | null;
    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      card: String(row.card_label ?? ""),
      cardId: cc?.card_key ?? undefined,
      monthly: Number(row.monthly ?? 0),
      out: Number(row.outstanding ?? 0),
      end: String(row.end_ym ?? ""),
      deductionDay:
        typeof row.deduction_day === "number" && row.deduction_day >= 1
          ? row.deduction_day
          : undefined,
      defaultFinancialAccountId: row.default_financial_account_id
        ? String(row.default_financial_account_id)
        : undefined,
    };
  });
}

async function cardKeyToUuid(
  supabase: SupabaseClient,
  userId: string
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("credit_cards")
    .select("id, card_key")
    .eq("user_id", userId);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.card_key), String(row.id));
  }
  return map;
}

export async function saveLoans(
  supabase: SupabaseClient,
  userId: string,
  incoming: Loan[]
): Promise<Loan[]> {
  const keyToUuid = await cardKeyToUuid(supabase, userId);

  const { data: existing } = await supabase
    .from("loans")
    .select("id, name")
    .eq("user_id", userId);

  const keepIds = new Set<string>();

  for (let i = 0; i < incoming.length; i++) {
    const l = incoming[i];
    const creditCardId = l.cardId ? keyToUuid.get(l.cardId) ?? null : null;
    const payload = {
      user_id: userId,
      name: l.name ?? "",
      card_label: l.card ?? "",
      credit_card_id: creditCardId,
      monthly: l.monthly ?? 0,
      outstanding: l.out ?? 0,
      end_ym: l.end ?? "",
      deduction_day: l.deductionDay ?? null,
      default_financial_account_id: l.defaultFinancialAccountId ?? null,
      sort_order: i,
      updated_at: new Date().toISOString(),
    };

    const match =
      l.id && UUID_RE.test(l.id)
        ? (existing ?? []).find((e) => e.id === l.id)
        : (existing ?? []).find((e) => e.name === l.name && !keepIds.has(e.id));
    if (match?.id && UUID_RE.test(match.id)) {
      keepIds.add(match.id);
      await supabase.from("loans").update(payload).eq("id", match.id);
    } else {
      const { data: ins } = await supabase.from("loans").insert(payload).select("id").single();
      if (ins?.id) keepIds.add(String(ins.id));
    }
  }

  for (const row of existing ?? []) {
    if (!keepIds.has(row.id)) {
      await supabase.from("loans").delete().eq("id", row.id);
    }
  }

  console.info("[loans] saved", { userId, count: incoming.length });
  return loadLoans(supabase, userId);
}

export async function migrateLoansFromDashboard(
  supabase: SupabaseClient,
  userId: string,
  loans: Loan[]
): Promise<void> {
  const { count } = await supabase
    .from("loans")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) > 0 || !loans.length) return;
  await saveLoans(supabase, userId, loans);
  console.info("[migrate] loans", { userId, count: loans.length });
}
