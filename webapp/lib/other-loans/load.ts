import type { SupabaseClient } from "@supabase/supabase-js";
import type { Loan } from "@/lib/types";
import type { OtherLoan, OtherLoanType } from "./types";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function mapRow(row: Record<string, unknown>, cardKey?: string): OtherLoan {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    loanType: String(row.loan_type ?? "personal") as OtherLoanType,
    principal: Number(row.principal ?? 0),
    outstanding: Number(row.outstanding ?? 0),
    interestRateApr: Number(row.interest_rate_apr ?? 0),
    tenureMonths:
      row.tenure_months == null ? undefined : Number(row.tenure_months),
    feesPaid: Number(row.fees_paid ?? 0),
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : undefined,
    sourceCreditCardId: cardKey,
    defaultFinancialAccountId: row.default_financial_account_id
      ? String(row.default_financial_account_id)
      : undefined,
    amountPaid: Number(row.amount_paid ?? 0),
    paidAt: row.paid_at ? String(row.paid_at) : null,
  };
}

async function cardKeyByUuid(
  supabase: SupabaseClient,
  userId: string
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("credit_cards")
    .select("id, card_key")
    .eq("user_id", userId);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.id), String(row.card_key));
  }
  return map;
}

async function cardUuidByKey(
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

/** Move legacy zero-monthly loans (e.g. balance transfer) into other_loans once. */
async function migrateLegacyNonInstalmentLoans(
  supabase: SupabaseClient,
  userId: string,
  instalmentLoans: Loan[]
): Promise<Loan[]> {
  const legacy = instalmentLoans.filter((l) => l.monthly <= 0 && l.out > 0);
  if (legacy.length === 0) return instalmentLoans;

  const keyToUuid = await cardUuidByKey(supabase, userId);
  const instalmentOnly = instalmentLoans.filter((l) => l.monthly > 0);

  for (const l of legacy) {
    const isBt =
      /balance\s*transfer|bt\b/i.test(l.name) || l.monthly === 0;
    const creditCardId = l.cardId ? keyToUuid.get(l.cardId) ?? null : null;
    const dueDate = l.end?.length >= 7 ? `${l.end.slice(0, 7)}-01` : null;

    await supabase.from("other_loans").insert({
      user_id: userId,
      name: l.name,
      loan_type: isBt ? "balance_transfer" : "personal",
      principal: l.out,
      outstanding: Math.max(0, l.out),
      interest_rate_apr: 0,
      due_date: dueDate,
      source_credit_card_id: isBt ? creditCardId : null,
      default_financial_account_id: l.defaultFinancialAccountId ?? null,
    });

    if (l.id && UUID_RE.test(l.id)) {
      await supabase.from("loans").delete().eq("id", l.id);
    }
    console.info("[other-loans] migrated legacy loan", { name: l.name, isBt });
  }

  return instalmentOnly;
}

export async function loadOtherLoans(
  supabase: SupabaseClient,
  userId: string
): Promise<OtherLoan[]> {
  const uuidToKey = await cardKeyByUuid(supabase, userId);

  const { data, error } = await supabase
    .from("other_loans")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const ccId = row.source_credit_card_id
      ? String(row.source_credit_card_id)
      : undefined;
    const cardKey = ccId ? uuidToKey.get(ccId) : undefined;
    return mapRow(row, cardKey);
  });
}

export async function loadInstalmentLoans(
  supabase: SupabaseClient,
  userId: string
): Promise<Loan[]> {
  const { data, error } = await supabase
    .from("loans")
    .select("*, credit_cards(card_key)")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);

  let loans: Loan[] = (data ?? []).map((row) => {
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

  loans = await migrateLegacyNonInstalmentLoans(supabase, userId, loans);
  return loans.filter((l) => l.monthly > 0);
}

export async function saveOtherLoans(
  supabase: SupabaseClient,
  userId: string,
  incoming: OtherLoan[]
): Promise<OtherLoan[]> {
  const keyToUuid = await cardUuidByKey(supabase, userId);

  const { data: existing } = await supabase
    .from("other_loans")
    .select("id")
    .eq("user_id", userId);

  const keepIds = new Set<string>();

  for (let i = 0; i < incoming.length; i++) {
    const o = incoming[i];
    const sourceCreditCardId = o.sourceCreditCardId
      ? keyToUuid.get(o.sourceCreditCardId) ?? null
      : null;

    if (o.loanType === "balance_transfer" && !sourceCreditCardId) {
      throw new Error(`Balance transfer "${o.name}" requires a source credit card`);
    }

    const payload = {
      user_id: userId,
      name: o.name ?? "",
      loan_type: o.loanType,
      principal: o.principal ?? 0,
      outstanding: o.outstanding ?? 0,
      interest_rate_apr: o.interestRateApr ?? 0,
      tenure_months: o.tenureMonths ?? null,
      fees_paid: o.feesPaid ?? 0,
      due_date: o.dueDate ?? null,
      source_credit_card_id: sourceCreditCardId,
      default_financial_account_id: o.defaultFinancialAccountId ?? null,
      amount_paid: o.amountPaid ?? 0,
      paid_at: o.paidAt ?? null,
      sort_order: i,
      updated_at: new Date().toISOString(),
    };

    const match =
      o.id && UUID_RE.test(o.id)
        ? (existing ?? []).find((e) => e.id === o.id)
        : undefined;

    if (match?.id) {
      keepIds.add(match.id);
      await supabase.from("other_loans").update(payload).eq("id", match.id);
    } else {
      const { data: ins } = await supabase
        .from("other_loans")
        .insert(payload)
        .select("id")
        .single();
      if (ins?.id) keepIds.add(String(ins.id));
    }
  }

  for (const row of existing ?? []) {
    if (!keepIds.has(row.id)) {
      await supabase.from("other_loans").delete().eq("id", row.id);
    }
  }

  console.info("[other-loans] saved", { userId, count: incoming.length });
  return loadOtherLoans(supabase, userId);
}

export async function migrateOtherLoansFromDashboard(
  supabase: SupabaseClient,
  userId: string,
  otherLoans: OtherLoan[]
): Promise<void> {
  const { count } = await supabase
    .from("other_loans")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) > 0 || !otherLoans.length) return;
  await saveOtherLoans(supabase, userId, otherLoans);
  console.info("[migrate] other_loans", { userId, count: otherLoans.length });
}
