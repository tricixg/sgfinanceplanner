import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinancialAccount } from "@/lib/expenses/auto-payment";
import { findIncomeCategoryBySlug } from "@/lib/income/load";
import { applyTransaction } from "@/lib/savings/ledger";
import { sgtNowTimeHms, sgtSpentAtToIso, sgtTodayYmd } from "@/lib/time/sgt";

export function travelReimbursementDepositNote(tripName: string): string {
  return `lump reimbursement: ${tripName.trim()}`;
}

/** ISO instant for a settlement deposit — today uses current SGT time; past dates use noon SGT. */
export function settlementDepositOccurredAt(settledAt: string, now: Date = new Date()): string {
  const date = settledAt.slice(0, 10);
  const time = date === sgtTodayYmd(now) ? sgtNowTimeHms(now) : "12:00:00";
  return sgtSpentAtToIso(date, time);
}

export async function applyReceivedSettlementDeposit(
  supabase: SupabaseClient,
  userId: string,
  input: {
    financialAccountId: string;
    tripName: string;
    amount: number;
    settledAt: string;
  }
): Promise<{ savingsTransactionId: string; note: string }> {
  const account = await loadFinancialAccount(supabase, userId, input.financialAccountId);
  if (!account) {
    throw new Error("Account not found");
  }
  if (account.accountType !== "cash" || !account.savingsAccountId) {
    throw new Error("Select a cash account linked to savings");
  }

  const category = await findIncomeCategoryBySlug(supabase, userId, "others");
  if (!category) {
    throw new Error("Others income category not found");
  }

  const note = travelReimbursementDepositNote(input.tripName);
  const txn = await applyTransaction(supabase, {
    userId,
    accountId: account.savingsAccountId,
    amount: input.amount,
    kind: "deposit",
    incomeCategoryId: category.id,
    note,
    occurredAt: settlementDepositOccurredAt(input.settledAt),
  });

  console.info("[travel-settlement-ledger] deposit applied", {
    userId,
    financialAccountId: input.financialAccountId,
    savingsTransactionId: txn.id,
    amount: input.amount,
    note,
  });

  return { savingsTransactionId: txn.id, note };
}
