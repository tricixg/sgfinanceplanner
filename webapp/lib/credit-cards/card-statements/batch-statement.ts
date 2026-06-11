import type { DbCreditCard } from "@/lib/credit-cards/mappers";
import {
  earliestStatementDay,
  targetStatementCloseForBatch,
} from "@/lib/cards/statement-cycle";
import type { DbCardStatement } from "./mappers";

export function findStatementForBatchOffset(
  rows: DbCardStatement[],
  card: Pick<DbCreditCard, "statementDay">,
  today: string,
  earliestDay: number,
  batchOffset: number
): DbCardStatement | undefined {
  const targetClose = targetStatementCloseForBatch(
    card.statementDay,
    today,
    earliestDay,
    batchOffset
  );
  const match = rows.find((r) => r.statementCloseDate === targetClose);
  if (!match) {
    console.info("[card-statements] batch statement row missing", {
      cardStatementDay: card.statementDay,
      targetClose,
      batchOffset,
    });
  }
  return match;
}

export function canViewOlderStatementBatch(
  cards: Pick<DbCreditCard, "statementDay">[],
  rowsByCard: DbCardStatement[][],
  today: string,
  earliestDay: number,
  batchOffset: number
): boolean {
  return cards.some((card, i) =>
    Boolean(
      findStatementForBatchOffset(
        rowsByCard[i] ?? [],
        card,
        today,
        earliestDay,
        batchOffset + 1
      )
    )
  );
}

export function resolveEarliestStatementDay(
  cards: Pick<DbCreditCard, "statementDay">[]
): number {
  return earliestStatementDay(cards.map((c) => c.statementDay));
}
