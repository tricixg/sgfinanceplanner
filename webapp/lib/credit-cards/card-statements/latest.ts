import { isStatementClosed } from "@/lib/cards/statement-cycle";

type StatementLike = { statementCloseDate: string };

/** Most recent statement whose billing cycle has ended, or undefined. */
export function latestClosedOf<T extends StatementLike>(
  rows: T[],
  today: string
): T | undefined {
  let best: T | undefined;
  for (const r of rows) {
    if (!isStatementClosed(r.statementCloseDate, today)) continue;
    if (!best || r.statementCloseDate > best.statementCloseDate) best = r;
  }
  return best;
}

/**
 * Once a newer statement closes, its amount already carries whatever was left unpaid
 * on earlier ones, so only the latest closed statement of a card can still be paid or
 * credited. Any statement older than the latest closed one is superseded.
 */
export function isSupersededStatement(
  rows: StatementLike[],
  today: string,
  statementCloseDate: string
): boolean {
  const latest = latestClosedOf(rows, today);
  return latest != null && statementCloseDate < latest.statementCloseDate;
}
