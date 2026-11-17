import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbCreditCard } from "@/lib/credit-cards/mappers";
import { loadCreditCards } from "@/lib/credit-cards/load";
import {
  outstandingBalance,
  openCycleCarriedForward,
  principalAtDue,
  balanceTransferWithinStatement,
  roundMoney,
  statementCarryIn,
} from "@/lib/cards/interest-accrual";
import { interestFreeBalanceTransferPrincipal } from "@/lib/other-loans/interest-free";
import { recomputeInterestForStatement } from "./interest";
import { latestClosedOf } from "./latest";
import {
  canViewOlderStatementBatch,
  findStatementForBatchOffset,
  resolveEarliestStatementDay,
} from "./batch-statement";
import {
  cycleBoundsFromClose,
  isStatementClosed,
  openCycleBounds,
  paymentDueDate,
  recentStatementCloseDates,
  statementBatchMonthLabel,
} from "@/lib/cards/statement-cycle";
import {
  buildCardSpendIndex,
  buildCardSpendIndexMap,
  type CardSpendIndex,
} from "@/lib/cards/statement-spend-index";
import { syncCreditCardFinancialAccountsFromRows } from "@/lib/financial-accounts/sync";
import { sgtTodayYmd } from "@/lib/time/sgt";
import type {
  CardStatementComputed,
  CardStatementsBundle,
  OpenCycleEstimate,
} from "@/lib/cards/types";
import {
  mapCardStatement,
  toCardStatementRow,
  type DbCardStatement,
} from "./mappers";

const HISTORY_CYCLES = 12;

function cycleSpendTotal(
  spendIndex: CardSpendIndex | null | undefined,
  cycleStart: string,
  cycleEnd: string
): number {
  if (!spendIndex) return 0;
  return spendIndex.sumInRange(cycleStart, cycleEnd);
}

function closingUnpaidForCarry(stmt: DbCardStatement): number {
  if (stmt.paidAt) return 0;
  const principal = principalAtDue({
    carriedForwardIn: statementCarryIn(stmt),
    actualAmount: stmt.actualAmount,
    amountPaid: stmt.amountPaid,
  });
  return roundMoney(principal + stmt.interestAccrued);
}

type NewStatementPayload = {
  user_id: string;
  credit_card_id: string;
  statement_close_date: string;
  cycle_start_date: string;
  cycle_end_date: string;
  payment_due_date: string;
  carried_forward_in: number;
  updated_at: string;
};

export type StatementRowsPlan = {
  /** Every row of the card after the plan is applied, newest close date first. New rows have a
   * placeholder id until they are written. */
  rows: DbCardStatement[];
  inserts: NewStatementPayload[];
  updates: { id: string; patch: Record<string, unknown> }[];
};

/**
 * What a row looks like straight after insert: the column defaults of card_statements
 * (migrations 017, 018, 058). The carry chain below reads these fields of a just-created row,
 * so the plan can be computed without writing it first.
 */
function freshStatementRow(payload: NewStatementPayload): DbCardStatement {
  return mapCardStatement({
    id: `pending:${payload.statement_close_date}`,
    ...payload,
    actual_amount: null,
    tracked_amount: null,
    amount_paid: 0,
    interest_accrued: 0,
    paid_at: null,
    amount_includes_prior_balance: false,
    minimum_due: null,
  });
}

/**
 * Decide which of a card's last HISTORY_CYCLES statement rows are missing or stale. Pure: the
 * cycle and carry-forward arithmetic is exactly what ensureStatementRows has always done,
 * walking the cycles oldest to newest so each row's carry comes from the one before it. It
 * only reports the writes needed; nothing is read or written here.
 */
export function planStatementRows(
  userId: string,
  card: Pick<DbCreditCard, "id" | "statementDay" | "paymentDueDay">,
  existing: DbCardStatement[],
  today: string
): StatementRowsPlan {
  const closeDates = recentStatementCloseDates(card.statementDay, HISTORY_CYCLES, today);
  const byClose = new Map(existing.map((r) => [r.statementCloseDate, r]));
  const inserts: NewStatementPayload[] = [];
  const updates: StatementRowsPlan["updates"] = [];

  const sortedCloses = [...closeDates].sort();
  let priorCarry = 0;

  for (const close of sortedCloses) {
    const { cycleStart, cycleEnd } = cycleBoundsFromClose(close, card.statementDay);
    const due = paymentDueDate(close, card.paymentDueDay);
    const row = byClose.get(close);

    if (!row) {
      const payload: NewStatementPayload = {
        user_id: userId,
        credit_card_id: card.id,
        statement_close_date: close,
        cycle_start_date: cycleStart,
        cycle_end_date: cycleEnd,
        payment_due_date: due,
        carried_forward_in: priorCarry,
        updated_at: new Date().toISOString(),
      };
      inserts.push(payload);
      const mapped = freshStatementRow(payload);
      byClose.set(close, mapped);
      priorCarry =
        today > due && !mapped.paidAt ? closingUnpaidForCarry(mapped) : 0;
    } else {
      const cycleDatesStale =
        row.cycleStartDate !== cycleStart || row.cycleEndDate !== cycleEnd;
      const carryStale = row.carriedForwardIn !== priorCarry && !row.paidAt;

      if (cycleDatesStale || carryStale) {
        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (cycleDatesStale) {
          patch.cycle_start_date = cycleStart;
          patch.cycle_end_date = cycleEnd;
        }
        if (carryStale) patch.carried_forward_in = priorCarry;
        updates.push({ id: row.id, patch });

        const mapped: DbCardStatement = {
          ...row,
          ...(cycleDatesStale ? { cycleStartDate: cycleStart, cycleEndDate: cycleEnd } : {}),
          ...(carryStale ? { carriedForwardIn: priorCarry } : {}),
        };
        byClose.set(close, mapped);
        if (cycleDatesStale) {
          console.info("[card-statements] corrected cycle dates", {
            statementId: row.id,
            cycleStart,
            cycleEnd,
          });
        }
        priorCarry =
          today > due && !mapped.paidAt ? closingUnpaidForCarry(mapped) : 0;
      } else {
        priorCarry =
          today > due && !row.paidAt ? closingUnpaidForCarry(row) : 0;
      }
    }
  }

  return {
    rows: [...byClose.values()].sort((a, b) =>
      b.statementCloseDate.localeCompare(a.statementCloseDate)
    ),
    inserts,
    updates,
  };
}

/**
 * A card's statement rows, with any missing/stale ones in the last HISTORY_CYCLES cycles
 * created/corrected first. In the steady state this is a single read and no writes. Missing
 * rows go in as ONE `INSERT … ON CONFLICT DO NOTHING` (unique index card_statements_card_close_uidx),
 * and corrections run in parallel, instead of one awaited write per row. Because the insert
 * ignores duplicates, two requests loading the same new card at once no longer fail on the
 * unique index: if another request created some of the rows first, this one re-reads and
 * re-plans against what is there.
 */
export async function ensureStatementRows(
  supabase: SupabaseClient,
  userId: string,
  card: DbCreditCard
): Promise<DbCardStatement[]> {
  const today = sgtTodayYmd();

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existingRows, error } = await supabase
      .from("card_statements")
      .select("*")
      .eq("credit_card_id", card.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    const plan = planStatementRows(
      userId,
      card,
      (existingRows ?? []).map((r) => mapCardStatement(r)),
      today
    );
    if (plan.inserts.length === 0 && plan.updates.length === 0) return plan.rows;

    const [insertResult, ...updateResults] = await Promise.all([
      plan.inserts.length > 0
        ? supabase
            .from("card_statements")
            .upsert(plan.inserts, {
              onConflict: "credit_card_id,statement_close_date",
              ignoreDuplicates: true,
            })
            .select("*")
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      ...plan.updates.map((u) =>
        supabase.from("card_statements").update(u.patch).eq("id", u.id)
      ),
    ]);
    if (insertResult.error) throw new Error(insertResult.error.message);
    for (const r of updateResults) if (r.error) throw new Error(r.error.message);

    const inserted = (insertResult.data ?? []).map((r) => mapCardStatement(r));
    if (inserted.length < plan.inserts.length) {
      // Another request created some of these rows between our read and write. Take the
      // authoritative rows (and their ids) from a fresh read.
      console.info("[card-statements] concurrent row creation; re-reading", {
        cardId: card.id,
        planned: plan.inserts.length,
        inserted: inserted.length,
      });
      continue;
    }

    const insertedByClose = new Map(inserted.map((r) => [r.statementCloseDate, r]));
    return plan.rows.map((r) => insertedByClose.get(r.statementCloseDate) ?? r);
  }
  throw new Error("Couldn't prepare card statements; please retry");
}

function closedStatementsNewestFirst(
  rows: DbCardStatement[],
  today: string
): DbCardStatement[] {
  return rows
    .filter((r) => isStatementClosed(r.statementCloseDate, today))
    .sort((a, b) => b.statementCloseDate.localeCompare(a.statementCloseDate));
}

/** Closed statement at `offset` cycles before the latest (0 = latest closed). */
export function findClosedStatementAtOffset(
  rows: DbCardStatement[],
  today: string,
  offset: number
): DbCardStatement | undefined {
  if (offset < 0) return undefined;
  const closed = closedStatementsNewestFirst(rows, today);
  if (offset < closed.length) return closed[offset];
  return undefined;
}

/** Most recent statement whose billing cycle has ended. */
export function findLatestClosedStatement(
  rows: DbCardStatement[],
  today: string
): DbCardStatement | undefined {
  return findClosedStatementAtOffset(rows, today, 0);
}

function enrichStatement(
  row: DbCardStatement,
  meta: { creditCardKey: string; cardName: string },
  interest: number,
  tracked: number,
  btInterestFree: number
): CardStatementComputed {
  const base = toCardStatementRow(
    { ...row, interestAccrued: interest, trackedAmount: tracked },
    meta
  );
  const today = sgtTodayYmd();
  // A bank-total amount also contains the previous balance, which isn't tracked spend.
  const priorInAmount = base.amountIncludesPriorBalance ? base.carriedForwardIn : 0;
  const untracked =
    base.actualAmount != null
      ? roundMoney(base.actualAmount - priorInAmount - base.trackedAmount)
      : null;
  const outstanding = outstandingBalance({
    carriedForwardIn: statementCarryIn(base),
    actualAmount: base.actualAmount,
    interestAccrued: interest,
    amountPaid: base.amountPaid,
  });
  const isClosed = isStatementClosed(base.statementCloseDate, today);
  const btPortion = balanceTransferWithinStatement(base, outstanding, btInterestFree);
  const isOverdue =
    today > base.paymentDueDate && outstanding - btPortion > 0.01 && !base.paidAt;

  return {
    ...base,
    untrackedAmount: untracked,
    outstandingBalance: outstanding,
    balanceTransferPortion: btPortion,
    isOverdue,
    isClosed,
  };
}

export async function loadCardStatementsBundle(
  supabase: SupabaseClient,
  userId: string,
  cardsInput: DbCreditCard[],
  cycleOffset = 0
): Promise<CardStatementsBundle> {
  const today = sgtTodayYmd();
  const safeOffset = Math.max(0, Math.min(HISTORY_CYCLES - 1, Math.floor(cycleOffset)));
  const statements: CardStatementComputed[] = [];
  const openCycles: OpenCycleEstimate[] = [];

  let cards = cardsInput;
  if (cards.some((c) => !c.financialAccountId)) {
    await syncCreditCardFinancialAccountsFromRows(supabase, userId, cards);
    cards = await loadCreditCards(supabase, userId);
    console.info("[card-statements] synced financial accounts for cards", {
      userId,
      count: cards.length,
    });
  }

  const rowsByCard = await Promise.all(
    cards.map((card) => ensureStatementRows(supabase, userId, card))
  );

  const earliestDay = resolveEarliestStatementDay(cards);

  // Decide up front which statements this response actually reads, so the spend
  // query only covers those cycles instead of the whole statement history
  // (DATA-004). Each card needs spend for: the open cycle, the latest closed
  // statement and the statement being viewed (cycleOffset). Interest for a
  // statement runs from after its due date to today, i.e. inside that span.
  const selections = cards.map((card, cardIdx) => {
    const rows = rowsByCard[cardIdx]!;
    const { statementClose: openClose } = openCycleBounds(card.statementDay, today);
    let latestClosed = findLatestClosedStatement(rows, today);
    if (!latestClosed && rows.length > 0) {
      latestClosed = rows.find((r) => r.statementCloseDate !== openClose) ?? rows[0];
    }
    const viewedClosed = findStatementForBatchOffset(
      rows,
      card,
      today,
      earliestDay,
      safeOffset
    );
    return { latestClosed, viewedClosed };
  });

  let spendFrom = today;
  cards.forEach((card, cardIdx) => {
    const { cycleStart } = openCycleBounds(card.statementDay, today);
    const { latestClosed, viewedClosed } = selections[cardIdx]!;
    for (const day of [
      cycleStart,
      latestClosed?.cycleStartDate,
      viewedClosed?.cycleStartDate,
    ]) {
      if (day && day < spendFrom) spendFrom = day;
    }
  });

  const finIds = cards
    .map((c) => c.financialAccountId)
    .filter((id): id is string => Boolean(id));
  const spendIndexMap =
    finIds.length > 0
      ? await buildCardSpendIndexMap(supabase, userId, finIds, spendFrom, today)
      : new Map();

  await Promise.all(
    cards.map(async (card, cardIdx) => {
      const finId = card.financialAccountId;
      const { statementClose: openClose, cycleStart, cycleEnd } = openCycleBounds(
        card.statementDay,
        today
      );

      const spendIndex = finId ? spendIndexMap.get(finId) ?? null : null;

      const { latestClosed, viewedClosed } = selections[cardIdx]!;
      // The viewed and the latest closed statement are the same row at offset 0; compute
      // (and, if it changed, write) a statement's interest once per load, not once per use.
      const interestByStatement = new Map<string, Promise<number>>();
      const interestFor = (stmt: DbCardStatement) => {
        let p = interestByStatement.get(stmt.id);
        if (!p) {
          p = recomputeInterestForStatement(supabase, userId, card, stmt, spendIndex);
          interestByStatement.set(stmt.id, p);
        }
        return p;
      };
      if (viewedClosed) {
        const tracked = cycleSpendTotal(
          spendIndex,
          viewedClosed.cycleStartDate,
          viewedClosed.cycleEndDate
        );
        const interest = await interestFor(viewedClosed);
        const btInterestFree = await interestFreeBalanceTransferPrincipal(
          supabase,
          userId,
          card.id,
          today
        );
        statements.push(
          enrichStatement(
            viewedClosed,
            { creditCardKey: card.cardKey, cardName: card.name },
            interest,
            tracked,
            btInterestFree
          )
        );
      }

      let carriedForward = 0;
      let interestEstimate = 0;
      const priorClosed = latestClosed;
      if (priorClosed && !priorClosed.paidAt) {
        const priorInterest = await interestFor(priorClosed);
        // Post-due interest is reported separately so it isn't counted twice
        // (once inside carried forward and again as the interest estimate).
        // Until the bank's real statement total is saved, fall back to this
        // just-closed cycle's own tracked spend so its balance doesn't
        // momentarily vanish from the open-cycle estimate.
        carriedForward = openCycleCarriedForward({
          carriedForwardIn: priorClosed.carriedForwardIn,
          actualAmount: priorClosed.actualAmount,
          amountIncludesPriorBalance: priorClosed.amountIncludesPriorBalance,
          amountPaid: priorClosed.amountPaid,
          trackedSpendInCycle: cycleSpendTotal(
            spendIndex,
            priorClosed.cycleStartDate,
            priorClosed.cycleEndDate
          ),
        });
        interestEstimate = priorInterest;
      }

      const newSpend = cycleSpendTotal(spendIndex, cycleStart, cycleEnd);

      const daysLeft = Math.max(
        0,
        Math.ceil(
          (new Date(cycleEnd + "T00:00:00Z").getTime() -
            new Date(today + "T00:00:00Z").getTime()) /
            86400000
        )
      );

      openCycles.push({
        creditCardId: card.id,
        creditCardKey: card.cardKey,
        cardName: card.name,
        statementCloseDate: openClose,
        cycleStartDate: cycleStart,
        cycleEndDate: cycleEnd,
        carriedForward,
        newSpend,
        interestEstimate,
        estimatedTotal: roundMoney(
          carriedForward + newSpend + interestEstimate
        ),
        daysLeftInCycle: daysLeft,
      });
    })
  );

  statements.sort((a, b) => a.cardName.localeCompare(b.cardName));
  openCycles.sort((a, b) => a.cardName.localeCompare(b.cardName));

  const closeDates = statements
    .map((s) => s.statementCloseDate)
    .sort((a, b) => a.localeCompare(b));

  const navigation = {
    cycleOffset: safeOffset,
    canGoOlder: canViewOlderStatementBatch(
      cards,
      rowsByCard,
      today,
      earliestDay,
      safeOffset
    ),
    canGoNewer: safeOffset > 0,
    batchMonthLabel: statementBatchMonthLabel(today, earliestDay, safeOffset),
    oldestCloseDate: closeDates[0] ?? null,
    newestCloseDate: closeDates[closeDates.length - 1] ?? null,
  };

  console.info("[card-statements] loaded bundle", {
    userId,
    statements: statements.length,
    openCycles: openCycles.length,
    cycleOffset: safeOffset,
  });

  return { configured: true, statements, openCycles, navigation };
}

/** Each card's latest closed statement, if it still has an outstanding balance. Older
 * unpaid statements are superseded (the newer statement already includes what carried
 * over), so they are never returned. Used for reimbursement targets and "still to pay". */
export async function loadOutstandingStatements(
  supabase: SupabaseClient,
  userId: string,
  cardsInput: DbCreditCard[]
): Promise<CardStatementComputed[]> {
  const today = sgtTodayYmd();

  let cards = cardsInput;
  if (cards.some((c) => !c.financialAccountId)) {
    await syncCreditCardFinancialAccountsFromRows(supabase, userId, cards);
    cards = await loadCreditCards(supabase, userId);
  }

  const rowsByCard = await Promise.all(
    cards.map((card) => ensureStatementRows(supabase, userId, card))
  );

  // paid_at is only ever set once a statement's outstanding balance hits zero (and
  // cleared again on undo), so a paid statement can never be outstanding — skip the
  // interest recompute/enrich work for it entirely. Most of a card's history (up to
  // HISTORY_CYCLES back) is paid, so this keeps this call fast regardless of history depth.
  // Only a card's latest closed statement can be outstanding: a newer statement's amount
  // already carries any unpaid remainder of earlier ones, so those are superseded.
  const perStatement = cards.flatMap((card, i) => {
    const latest = latestClosedOf(rowsByCard[i] ?? [], today);
    return latest && !latest.paidAt ? [{ card, row: latest }] : [];
  });

  // Only the statements listed above read spend, so bound the query to their
  // cycles rather than the whole statement history (DATA-004).
  let spendFrom = today;
  for (const { row } of perStatement) {
    if (row.cycleStartDate < spendFrom) spendFrom = row.cycleStartDate;
  }
  const finIds = [
    ...new Set(
      perStatement
        .map((p) => p.card.financialAccountId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const spendIndexMap =
    finIds.length > 0
      ? await buildCardSpendIndexMap(supabase, userId, finIds, spendFrom, today)
      : new Map();

  const btFreeByCardId = new Map<string, number>();
  await Promise.all(
    [...new Set(perStatement.map((p) => p.card.id))].map(async (cardId) => {
      btFreeByCardId.set(
        cardId,
        await interestFreeBalanceTransferPrincipal(supabase, userId, cardId, today)
      );
    })
  );

  const enriched = await Promise.all(
    perStatement.map(async ({ card, row }) => {
      const spendIndex = card.financialAccountId
        ? spendIndexMap.get(card.financialAccountId) ?? null
        : null;
      const tracked = cycleSpendTotal(spendIndex, row.cycleStartDate, row.cycleEndDate);
      const interest = await recomputeInterestForStatement(
        supabase,
        userId,
        card,
        row,
        spendIndex
      );
      return enrichStatement(
        row,
        { creditCardKey: card.cardKey, cardName: card.name },
        interest,
        tracked,
        btFreeByCardId.get(card.id) ?? 0
      );
    })
  );

  const outstanding = enriched.filter((s) => s.isClosed && s.outstandingBalance > 0.01);

  outstanding.sort((a, b) =>
    a.cardName === b.cardName
      ? b.statementCloseDate.localeCompare(a.statementCloseDate)
      : a.cardName.localeCompare(b.cardName)
  );

  console.info("[card-statements] loaded outstanding statements", {
    userId,
    count: outstanding.length,
  });

  return outstanding;
}

export async function updateStatementFields(
  supabase: SupabaseClient,
  userId: string,
  statementId: string,
  fields: {
    actualAmount?: number;
    minimumDue?: number | null;
    amountIncludesPriorBalance?: boolean;
  },
  card: DbCreditCard
): Promise<CardStatementComputed> {
  const { data: row, error } = await supabase
    .from("card_statements")
    .select("*")
    .eq("id", statementId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Statement not found");

  const db = mapCardStatement(row);
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (fields.actualAmount != null) {
    if (!Number.isFinite(fields.actualAmount) || fields.actualAmount < 0) {
      throw new Error("Invalid statement amount");
    }
    patch.actual_amount = fields.actualAmount;
  }

  if (fields.minimumDue !== undefined) {
    if (
      fields.minimumDue != null &&
      (!Number.isFinite(fields.minimumDue) || fields.minimumDue < 0)
    ) {
      throw new Error("Invalid minimum due");
    }
    patch.minimum_due = fields.minimumDue;
  }

  if (fields.amountIncludesPriorBalance !== undefined) {
    patch.amount_includes_prior_balance = fields.amountIncludesPriorBalance;
  }

  let tracked = db.trackedAmount ?? 0;
  if (fields.actualAmount != null && card.financialAccountId) {
    const spendIndex = await buildCardSpendIndex(
      supabase,
      userId,
      card.financialAccountId,
      db.cycleStartDate,
      db.cycleEndDate
    );
    tracked = cycleSpendTotal(spendIndex, db.cycleStartDate, db.cycleEndDate);
    patch.tracked_amount = tracked;
  }

  const { data: updated, error: updErr } = await supabase
    .from("card_statements")
    .update(patch)
    .eq("id", statementId)
    .select("*")
    .single();

  if (updErr) throw new Error(updErr.message);
  const mapped = mapCardStatement(updated);
  const interest = await recomputeInterestForStatement(
    supabase,
    userId,
    card,
    mapped
  );

  const btInterestFree = await interestFreeBalanceTransferPrincipal(
    supabase,
    userId,
    card.id
  );

  return enrichStatement(
    mapped,
    { creditCardKey: card.cardKey, cardName: card.name },
    interest,
    mapped.trackedAmount ?? tracked,
    btInterestFree
  );
}

/** @deprecated Use updateStatementFields */
export async function updateStatementActual(
  supabase: SupabaseClient,
  userId: string,
  statementId: string,
  actualAmount: number,
  card: DbCreditCard
): Promise<CardStatementComputed> {
  return updateStatementFields(supabase, userId, statementId, { actualAmount }, card);
}
