import type { SupabaseClient } from "@supabase/supabase-js";

export type OtherLoanPaymentRow = {
  id: string;
  amount: number;
  occurredAt: string;
  accountName: string;
  note: string;
};

export async function loadOtherLoanPayments(
  supabase: SupabaseClient,
  userId: string,
  loanId: string
): Promise<OtherLoanPaymentRow[]> {
  const { data: rows, error } = await supabase
    .from("savings_transactions")
    .select("id, amount, occurred_at, account_id, note")
    .eq("user_id", userId)
    .eq("source_record_type", "other_loan")
    .eq("source_record_id", loanId)
    .eq("kind", "withdrawal")
    .order("occurred_at", { ascending: false });

  if (error) throw new Error(error.message);

  const accountIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => (r.account_id ? String(r.account_id) : ""))
        .filter(Boolean)
    ),
  ];

  const nameByAccountId = new Map<string, string>();
  if (accountIds.length > 0) {
    const { data: accounts, error: acctErr } = await supabase
      .from("user_savings_accounts")
      .select("id, name")
      .eq("user_id", userId)
      .in("id", accountIds);

    if (acctErr) throw new Error(acctErr.message);
    for (const acct of accounts ?? []) {
      nameByAccountId.set(String(acct.id), String(acct.name ?? "Cash"));
    }
  }

  const payments = (rows ?? []).map((row) => ({
    id: String(row.id),
    amount: Math.abs(Number(row.amount ?? 0)),
    occurredAt: String(row.occurred_at ?? ""),
    accountName: row.account_id
      ? (nameByAccountId.get(String(row.account_id)) ?? "Cash account")
      : "No account",
    note: String(row.note ?? ""),
  }));

  console.info("[other-loans] payment history loaded", {
    loanId,
    count: payments.length,
  });

  return payments;
}
