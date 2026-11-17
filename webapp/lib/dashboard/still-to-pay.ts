import type { CardStatementComputed } from "@/lib/cards/types";
import { roundMoney } from "@/lib/cards/interest-accrual";

export type CardUpcomingItem = {
  key: string;
  name: string;
  kind: "card";
  due: string;
  amount: number;
};

/**
 * Card amounts still to pay this month: one item per card (its latest statement), net of
 * the balance-transfer portion that keeps carrying over, and only if the statement is due
 * this month (YYYY-MM of `today`) or already overdue.
 */
export function cardUpcomingItems(
  statements: Pick<
    CardStatementComputed,
    | "id"
    | "creditCardKey"
    | "cardName"
    | "statementCloseDate"
    | "paymentDueDate"
    | "outstandingBalance"
    | "balanceTransferPortion"
  >[],
  today: string
): CardUpcomingItem[] {
  const latestByCard = new Map<string, (typeof statements)[number]>();
  for (const s of statements) {
    const prev = latestByCard.get(s.creditCardKey);
    if (!prev || s.statementCloseDate > prev.statementCloseDate) {
      latestByCard.set(s.creditCardKey, s);
    }
  }
  const ym = today.slice(0, 7);
  const items: CardUpcomingItem[] = [];
  for (const s of latestByCard.values()) {
    const amount = roundMoney(
      Math.max(0, s.outstandingBalance - s.balanceTransferPortion)
    );
    if (amount <= 0.01) continue;
    if (!(s.paymentDueDate.slice(0, 7) === ym || s.paymentDueDate < today)) continue;
    items.push({
      key: `card:${s.id}`,
      name: s.cardName,
      kind: "card",
      due: s.paymentDueDate,
      amount,
    });
  }
  return items;
}
