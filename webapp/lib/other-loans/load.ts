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
    btStartDate: row.bt_start_date ? String(row.bt_start_date).slice(0, 10) : undefined,
    financeCharge: Number(row.finance_charge ?? 0),
    sourceCreditCardId: cardKey,
    defaultFinancialAccountId: row.default_financial_account_id
      ? String(row.default_financial_account_id)
      : undefined,
    amountPaid: Number(row.amount_paid ?? 0),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    excludeFromNetWorth: Boolean(row.exclude_from_net_worth),
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

async function financialAccountByCardUuid(
  supabase: SupabaseClient,
  userId: string
): Promise<Map<string, string | null>> {
  const { data: faRows } = await supabase
    .from("financial_accounts")
    .select("id, card_key")
    .eq("user_id", userId)
    .eq("account_type", "credit_card");
  const faByCardKey = new Map<string, string>();
  for (const row of faRows ?? []) {
    const key = row.card_key ? String(row.card_key) : "";
    const id = row.id ? String(row.id) : "";
    if (!key || !id) continue;
    faByCardKey.set(key, id);
  }

  const { data } = await supabase
    .from("credit_cards")
    .select("id, card_key, financial_account_id")
    .eq("user_id", userId);
  const map = new Map<string, string | null>();
  for (const row of data ?? []) {
    const cardId = String(row.id);
    const direct = row.financial_account_id ? String(row.financial_account_id) : null;
    const cardKey = row.card_key ? String(row.card_key) : "";
    const fallback = cardKey ? faByCardKey.get(cardKey) ?? null : null;
    map.set(cardId, direct ?? fallback);
  }
  return map;
}

async function syncBtFinanceChargeExpense(
  supabase: SupabaseClient,
  userId: string,
  loanId: string,
  opts: {
    loanName: string;
    cardUuid: string | null;
    payFromFinancialAccountId?: string;
    btStartDate?: string;
    financeCharge: number;
    financeChargeExpenseId?: string | null;
  },
  cardToFinancialAccount: Map<string, string | null>
): Promise<string | null> {
  const charge = Number(opts.financeCharge ?? 0);
  const btStartDate = opts.btStartDate ? String(opts.btStartDate).slice(0, 10) : "";
  const hasValidDate = /^\d{4}-\d{2}-\d{2}$/.test(btStartDate);
  const financialAccountId =
    opts.payFromFinancialAccountId ??
    (opts.cardUuid ? cardToFinancialAccount.get(opts.cardUuid) ?? null : null);

  if (!(charge > 0) || !hasValidDate || !financialAccountId) {
    console.info("[other-loans] skip BT charge expense sync", {
      loanId,
      charge,
      hasValidDate,
      hasFinancialAccount: Boolean(financialAccountId),
      btStartDate: btStartDate || null,
      cardUuid: opts.cardUuid,
      payFromFinancialAccountId: opts.payFromFinancialAccountId ?? null,
    });
    if (opts.financeChargeExpenseId) {
      const { error: delErr } = await supabase
        .from("expenses")
        .delete()
        .eq("id", opts.financeChargeExpenseId)
        .eq("user_id", userId);
      if (delErr) throw new Error(delErr.message);
    }
    return null;
  }

  const note = `BT finance charge: ${opts.loanName}`;
  let targetExpenseId = opts.financeChargeExpenseId ?? null;
  if (!targetExpenseId) {
    const { data: existingExpense } = await supabase
      .from("expenses")
      .select("id")
      .eq("user_id", userId)
      .eq("category", "Balance transfer finance charge")
      .eq("note", note)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingExpense?.id) {
      targetExpenseId = String(existingExpense.id);
    }
  }

  if (targetExpenseId) {
    const { error: updErr } = await supabase
      .from("expenses")
      .update({
        amount: charge,
        category: "Balance transfer finance charge",
        spent_at: btStartDate,
        note,
        financial_account_id: financialAccountId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetExpenseId)
      .eq("user_id", userId);
    if (updErr) throw new Error(updErr.message);
    return targetExpenseId;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("expenses")
    .insert({
      user_id: userId,
      amount: charge,
      category: "Balance transfer finance charge",
      spent_at: btStartDate,
      note,
      financial_account_id: financialAccountId,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  console.info("[other-loans] created BT finance charge expense", {
    loanId,
    amount: charge,
    spentAt: btStartDate,
    financialAccountId,
    expenseId: inserted?.id ?? null,
  });
  return inserted?.id ? String(inserted.id) : null;
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
  const cardToFinancialAccount = await financialAccountByCardUuid(supabase, userId);

  const { data: existing } = await supabase
    .from("other_loans")
    .select("id, finance_charge_expense_id")
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
      fees_paid: o.loanType === "balance_transfer" ? 0 : o.feesPaid ?? 0,
      due_date: o.dueDate ?? null,
      bt_start_date: o.btStartDate ?? null,
      finance_charge: o.financeCharge ?? 0,
      source_credit_card_id: sourceCreditCardId,
      default_financial_account_id: o.defaultFinancialAccountId ?? null,
      amount_paid: o.amountPaid ?? 0,
      paid_at: o.paidAt ?? null,
      exclude_from_net_worth:
        o.loanType === "personal" ? Boolean(o.excludeFromNetWorth) : false,
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
      if (o.loanType === "balance_transfer") {
        const expenseId = await syncBtFinanceChargeExpense(
          supabase,
          userId,
          match.id,
          {
            loanName: o.name ?? "Balance transfer",
            cardUuid: sourceCreditCardId,
            payFromFinancialAccountId: o.defaultFinancialAccountId ?? undefined,
            btStartDate: o.btStartDate,
            financeCharge: o.financeCharge ?? 0,
            financeChargeExpenseId: match.finance_charge_expense_id
              ? String(match.finance_charge_expense_id)
              : null,
          },
          cardToFinancialAccount
        );
        await supabase
          .from("other_loans")
          .update({
            finance_charge_expense_id: expenseId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", match.id)
          .eq("user_id", userId);
      } else if (match.finance_charge_expense_id) {
        await supabase
          .from("expenses")
          .delete()
          .eq("id", String(match.finance_charge_expense_id))
          .eq("user_id", userId);
        await supabase
          .from("other_loans")
          .update({
            finance_charge_expense_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", match.id)
          .eq("user_id", userId);
      }
    } else {
      const { data: ins } = await supabase
        .from("other_loans")
        .insert(payload)
        .select("id")
        .single();
      if (ins?.id) keepIds.add(String(ins.id));
      if (ins?.id && o.loanType === "balance_transfer") {
        const loanId = String(ins.id);
        const expenseId = await syncBtFinanceChargeExpense(
          supabase,
          userId,
          loanId,
          {
            loanName: o.name ?? "Balance transfer",
            cardUuid: sourceCreditCardId,
            payFromFinancialAccountId: o.defaultFinancialAccountId ?? undefined,
            btStartDate: o.btStartDate,
            financeCharge: o.financeCharge ?? 0,
          },
          cardToFinancialAccount
        );
        await supabase
          .from("other_loans")
          .update({
            finance_charge_expense_id: expenseId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", loanId)
          .eq("user_id", userId);
      }
    }
  }

  for (const row of existing ?? []) {
    if (!keepIds.has(row.id)) {
      if (row.finance_charge_expense_id) {
        await supabase
          .from("expenses")
          .delete()
          .eq("id", String(row.finance_charge_expense_id))
          .eq("user_id", userId);
      }
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
