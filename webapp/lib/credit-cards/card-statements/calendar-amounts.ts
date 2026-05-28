import type { SupabaseClient } from "@supabase/supabase-js";
import { paymentDueDate } from "@/lib/cards/statement-cycle";
import type { DbCreditCard } from "@/lib/credit-cards/mappers";
import { todayYmd } from "@/lib/cards/interest-accrual";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function sliceYmd(value: unknown): string {
  if (value == null || value === "") return "";
  const s = String(value).slice(0, 10);
  return YMD_RE.test(s) ? s : "";
}

export type CardStatementAmountEntry = {
  creditCardId: string;
  statementCloseDate: string;
  paymentDueDate: string;
  actualAmount: number | null;
};

export async function loadCardStatementAmountEntries(
  supabase: SupabaseClient,
  userId: string
): Promise<CardStatementAmountEntry[]> {
  const { data, error } = await supabase
    .from("card_statements")
    .select("credit_card_id, statement_close_date, payment_due_date, actual_amount")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    creditCardId: String(row.credit_card_id),
    statementCloseDate: sliceYmd(row.statement_close_date),
    paymentDueDate: sliceYmd(row.payment_due_date),
    actualAmount:
      row.actual_amount != null ? Number(row.actual_amount) : null,
  }));
}

/** Fill missing due dates and drop rows without valid close dates. */
export function normalizeCardStatementAmountEntries(
  entries: CardStatementAmountEntry[],
  cards: Pick<DbCreditCard, "id" | "paymentDueDay">[] = []
): CardStatementAmountEntry[] {
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const out: CardStatementAmountEntry[] = [];

  for (const e of entries) {
    if (!e.statementCloseDate) continue;
    let due = sliceYmd(e.paymentDueDate);
    if (!due) {
      const card = cardById.get(e.creditCardId);
      if (card) {
        due = paymentDueDate(e.statementCloseDate, card.paymentDueDay);
      }
    }
    if (!due) continue;
    out.push({
      creditCardId: e.creditCardId,
      statementCloseDate: e.statementCloseDate,
      paymentDueDate: due,
      actualAmount: e.actualAmount,
    });
  }

  return out;
}

/** Amount saved for a statement whose payment is due on `paymentDueYmd`. */
export function amountForPaymentDue(
  entries: CardStatementAmountEntry[],
  creditCardId: string,
  paymentDueYmd: string
): number | null {
  for (const e of entries) {
    if (e.creditCardId !== creditCardId) continue;
    if (!e.paymentDueDate || e.paymentDueDate !== paymentDueYmd) continue;
    if (e.actualAmount != null && e.actualAmount > 0) return e.actualAmount;
  }
  return null;
}

/** Latest closed statement actual amounts (for summary stat). */
export async function loadEnteredStatementAmounts(
  supabase: SupabaseClient,
  userId: string,
  cards: DbCreditCard[]
): Promise<number[]> {
  const { data, error } = await supabase
    .from("card_statements")
    .select("credit_card_id, statement_close_date, actual_amount, cycle_end_date")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  const today = todayYmd();
  const byCard = new Map<string, typeof data>();
  for (const row of data ?? []) {
    const id = String(row.credit_card_id);
    const list = byCard.get(id) ?? [];
    list.push(row);
    byCard.set(id, list);
  }

  const amounts: number[] = [];
  for (const card of cards) {
    const rows = (byCard.get(card.id) ?? []).sort((a, b) =>
      String(b.statement_close_date).localeCompare(
        String(a.statement_close_date)
      )
    );
    const latestClosed =
      rows.find((r) => String(r.cycle_end_date).slice(0, 10) < today) ?? rows[0];
    const amt = latestClosed?.actual_amount;
    if (amt != null && Number(amt) > 0) amounts.push(Number(amt));
  }

  return amounts;
}

export function amountsByCloseForCard(
  entries: CardStatementAmountEntry[],
  creditCardId: string
): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const e of entries) {
    if (e.creditCardId !== creditCardId) continue;
    map.set(e.statementCloseDate, e.actualAmount);
  }
  return map;
}

/** Match saved amount to projected close (exact date, else same month). */
export function resolveAmountForClose(
  amountsByClose: Map<string, number | null>,
  projectedCloseDate: string
): number | null {
  const direct = amountsByClose.get(projectedCloseDate);
  if (direct != null && direct > 0) return direct;

  const ym = projectedCloseDate.slice(0, 7);
  let bestDate = "";
  let bestAmount: number | null = null;
  for (const [date, amt] of amountsByClose) {
    if (!date.startsWith(ym) || amt == null || amt <= 0) continue;
    if (date > bestDate) {
      bestDate = date;
      bestAmount = amt;
    }
  }
  return bestAmount;
}
