import type { SupabaseClient } from "@supabase/supabase-js";
import type { Loan } from "@/lib/types";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function loadLoans(
  supabase: SupabaseClient,
  userId: string
): Promise<Loan[]> {
  const { loadInstalmentLoans } = await import("@/lib/other-loans/load");
  return loadInstalmentLoans(supabase, userId);
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
  const instalmentOnly = incoming.filter((l) => l.monthly > 0);
  const keyToUuid = await cardKeyToUuid(supabase, userId);

  const { data: existing } = await supabase
    .from("loans")
    .select("id, name")
    .eq("user_id", userId);

  const keepIds = new Set<string>();

  for (let i = 0; i < instalmentOnly.length; i++) {
    const l = instalmentOnly[i];
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

  console.info("[loans] saved instalment plans", {
    userId,
    count: instalmentOnly.length,
  });
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
