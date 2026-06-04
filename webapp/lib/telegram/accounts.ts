import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCreditCards } from "@/lib/credit-cards/load";
import {
  loadFinancialAccounts,
  syncCashFinancialAccounts,
  syncCreditCardFinancialAccountsFromRows,
} from "@/lib/financial-accounts/sync";
import type { FinancialAccount, FinancialAccountType } from "@/lib/transactions/types";

export type CashAccountWithBalance = FinancialAccount & { balance: number };

export type AccountPickerOption = {
  id: string;
  name: string;
  accountType: FinancialAccountType;
  /** Cash linked to savings; null for cards or unlinked cash. */
  balance: number | null;
};

async function savingsBalancesById(
  supabase: SupabaseClient,
  userId: string,
  savingsIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (savingsIds.length === 0) return map;

  const { data, error } = await supabase
    .from("user_savings_accounts")
    .select("id, balance")
    .eq("user_id", userId)
    .in("id", savingsIds);

  if (error) {
    console.error("[telegram] savings balances failed", error.message);
    return map;
  }
  for (const row of data ?? []) {
    map.set(String(row.id), Number(row.balance));
  }
  return map;
}

/** All pay-from accounts (cash + credit cards) — same set as PayFromAccountSelect on web. */
export async function loadPayFromAccountsForExpense(
  supabase: SupabaseClient,
  userId: string
): Promise<AccountPickerOption[]> {
  await syncCashFinancialAccounts(supabase, userId);
  const cardRows = await loadCreditCards(supabase, userId);
  await syncCreditCardFinancialAccountsFromRows(supabase, userId, cardRows);

  const all = await loadFinancialAccounts(supabase, userId);
  const savingsIds = all
    .map((a) => a.savingsAccountId)
    .filter((id): id is string => Boolean(id));
  const balanceBySavingsId = await savingsBalancesById(supabase, userId, savingsIds);

  const options = all.map((a) => ({
    id: a.id,
    name: a.name,
    accountType: a.accountType,
    balance:
      a.accountType === "cash" && a.savingsAccountId
        ? (balanceBySavingsId.get(a.savingsAccountId) ?? 0)
        : null,
  }));

  console.info("[telegram] pay-from accounts for expense", {
    userId,
    count: options.length,
    cards: options.filter((a) => a.accountType === "credit_card").length,
  });

  return options;
}

export function accountPickerKindForFlow(
  flow: string
): "cash_ledger" | "expense_pay_from" {
  if (flow === "expense" || flow === "travel") return "expense_pay_from";
  return "cash_ledger";
}

export async function loadAccountPickerOptions(
  supabase: SupabaseClient,
  userId: string,
  kind: "cash_ledger" | "expense_pay_from"
): Promise<AccountPickerOption[]> {
  if (kind === "expense_pay_from") {
    return loadPayFromAccountsForExpense(supabase, userId);
  }

  const cash = await loadCashAccountsForLedger(supabase, userId);
  return cash.map((a) => ({
    id: a.id,
    name: a.name,
    accountType: a.accountType,
    balance: a.balance,
  }));
}

/** Cash accounts linked to savings — same filter as TabPoker ledger dropdown. */
export async function loadCashAccountsForLedger(
  supabase: SupabaseClient,
  userId: string
): Promise<CashAccountWithBalance[]> {
  await syncCashFinancialAccounts(supabase, userId);
  const all = await loadFinancialAccounts(supabase, userId);
  const accounts = all.filter((a): a is FinancialAccount & { savingsAccountId: string } =>
    Boolean(a.savingsAccountId)
  );

  if (accounts.length === 0) return [];

  const savingsIds = accounts.map((a) => a.savingsAccountId);
  const balanceBySavingsId = await savingsBalancesById(supabase, userId, savingsIds);

  return accounts.map((a) => ({
    ...a,
    balance: balanceBySavingsId.get(a.savingsAccountId) ?? 0,
  }));
}
