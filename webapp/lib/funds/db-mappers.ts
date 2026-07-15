import type { Fund, FundTransaction } from "@/lib/funds/types";

export function mapFund(row: Record<string, unknown>): Fund {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? ""),
    balance: Number(row.balance ?? 0),
    notes: String(row.notes ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    lifetimePayouts: 0,
  };
}

export function mapFundTransaction(row: Record<string, unknown>): FundTransaction {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    fundId: String(row.fund_id),
    goalId: row.goal_id ? String(row.goal_id) : null,
    goalName: null,
    kind: (row.kind === "withdrawal" || row.kind === "payout"
      ? row.kind
      : "deposit") as FundTransaction["kind"],
    amount: Number(row.amount ?? 0),
    balanceAfter: row.balance_after != null ? Number(row.balance_after) : null,
    note: String(row.note ?? ""),
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
  };
}
