import type { FinancialAccount, FinancialAccountType } from "@/lib/transactions/types";

export function mapFinancialAccount(row: Record<string, unknown>): FinancialAccount {
  const t = String(row.account_type ?? "cash");
  const accountType: FinancialAccountType =
    t === "credit_card" ? "credit_card" : "cash";
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? "").trim() || "Account",
    accountType,
    savingsAccountId: row.savings_account_id ? String(row.savings_account_id) : null,
    cardKey: row.card_key ? String(row.card_key) : null,
    sortOrder: Number(row.sort_order ?? 0),
  };
}
