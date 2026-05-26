import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbCreditCard } from "@/lib/credit-cards/mappers";
import {
  accrueDailyInterest,
  interestStartAfterDue,
  outstandingBalance,
  principalAtDue,
  roundMoney,
  todayYmd,
} from "@/lib/cards/interest-accrual";
import { recomputeInterestForStatement } from "./interest";
import {
  cycleBoundsFromClose,
  openCycleBounds,
  paymentDueDate,
  recentStatementCloseDates,
} from "@/lib/cards/statement-cycle";
import {
  buildCardSpendIndex,
  buildCardSpendIndexMap,
} from "@/lib/cards/statement-spend-index";
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

function closingUnpaidForCarry(stmt: DbCardStatement): number {
  if (stmt.paidAt) return 0;
  const principal = principalAtDue({
    carriedForwardIn: stmt.carriedForwardIn,
    actualAmount: stmt.actualAmount,
    amountPaid: stmt.amountPaid,
  });
  return roundMoney(principal + stmt.interestAccrued);
}

async function ensureStatementRows(
  supabase: SupabaseClient,
  userId: string,
  card: DbCreditCard
): Promise<DbCardStatement[]> {
  const today = todayYmd();
  const closeDates = recentStatementCloseDates(
    card.statementDay,
    HISTORY_CYCLES,
    today
  );

  const { data: existing, error } = await supabase
    .from("card_statements")
    .select("*")
    .eq("credit_card_id", card.id)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  const byClose = new Map(
    (existing ?? []).map((r) => [
      String(r.statement_close_date).slice(0, 10),
      mapCardStatement(r),
    ])
  );

  const sortedCloses = [...closeDates].sort();
  let priorCarry = 0;

  for (const close of sortedCloses) {
    const { cycleStart, cycleEnd } = cycleBoundsFromClose(close, card.statementDay);
    const due = paymentDueDate(close, card.paymentDueDay);
    const row = byClose.get(close);

    if (!row) {
      const payload = {
        user_id: userId,
        credit_card_id: card.id,
        statement_close_date: close,
        cycle_start_date: cycleStart,
        cycle_end_date: cycleEnd,
        payment_due_date: due,
        carried_forward_in: priorCarry,
        updated_at: new Date().toISOString(),
      };
      const { data: inserted, error: insErr } = await supabase
        .from("card_statements")
        .insert(payload)
        .select("*")
        .single();
      if (insErr) throw new Error(insErr.message);
      const mapped = mapCardStatement(inserted);
      byClose.set(close, mapped);
      priorCarry =
        today > due && !mapped.paidAt ? closingUnpaidForCarry(mapped) : 0;
    } else {
      if (row.carriedForwardIn !== priorCarry && !row.paidAt) {
        const { data: updated, error: updErr } = await supabase
          .from("card_statements")
          .update({
            carried_forward_in: priorCarry,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .select("*")
          .single();
        if (updErr) throw new Error(updErr.message);
        const mapped = mapCardStatement(updated);
        byClose.set(close, mapped);
        priorCarry =
          today > due && !mapped.paidAt ? closingUnpaidForCarry(mapped) : 0;
      } else {
        priorCarry =
          today > due && !row.paidAt ? closingUnpaidForCarry(row) : 0;
      }
    }
  }

  return [...byClose.values()].sort((a, b) =>
    b.statementCloseDate.localeCompare(a.statementCloseDate)
  );
}

/** Most recent statement whose billing cycle has ended. */
export function findLatestClosedStatement(
  rows: DbCardStatement[],
  today: string
): DbCardStatement | undefined {
  const closed = rows.filter((r) => r.cycleEndDate < today);
  if (closed.length === 0) return undefined;
  return closed.sort((a, b) =>
    b.statementCloseDate.localeCompare(a.statementCloseDate)
  )[0];
}

function enrichStatement(
  row: DbCardStatement,
  meta: { creditCardKey: string; cardName: string },
  interest: number,
  tracked: number
): CardStatementComputed {
  const base = toCardStatementRow(
    { ...row, interestAccrued: interest, trackedAmount: tracked },
    meta
  );
  const today = todayYmd();
  const untracked =
    base.actualAmount != null
      ? roundMoney(base.actualAmount - base.trackedAmount)
      : null;
  const outstanding = outstandingBalance({
    carriedForwardIn: base.carriedForwardIn,
    actualAmount: base.actualAmount,
    interestAccrued: interest,
    amountPaid: base.amountPaid,
  });
  const isClosed = today > base.cycleEndDate;
  const isOverdue =
    today > base.paymentDueDate && outstanding > 0 && !base.paidAt;

  return {
    ...base,
    untrackedAmount: untracked,
    outstandingBalance: outstanding,
    isOverdue,
    isClosed,
  };
}

export async function loadCardStatementsBundle(
  supabase: SupabaseClient,
  userId: string,
  cards: DbCreditCard[]
): Promise<CardStatementsBundle> {
  const today = todayYmd();
  const statements: CardStatementComputed[] = [];
  const openCycles: OpenCycleEstimate[] = [];

  const rowsByCard = await Promise.all(
    cards.map((card) => ensureStatementRows(supabase, userId, card))
  );

  let spendFrom = today;
  for (const rows of rowsByCard) {
    for (const r of rows) {
      if (r.cycleStartDate < spendFrom) spendFrom = r.cycleStartDate;
    }
  }

  const finIds = cards
    .map((c) => c.financialAccountId)
    .filter((id): id is string => Boolean(id));
  const spendIndexMap =
    finIds.length > 0
      ? await buildCardSpendIndexMap(supabase, userId, finIds, spendFrom, today)
      : new Map();

  await Promise.all(
    cards.map(async (card, cardIdx) => {
      const rows = rowsByCard[cardIdx]!;
      const finId = card.financialAccountId;
      const { statementClose: openClose, cycleStart, cycleEnd } = openCycleBounds(
        card.statementDay,
        today
      );

      const spendIndex = finId ? spendIndexMap.get(finId) ?? null : null;

      let latestClosed = findLatestClosedStatement(rows, today);
      if (!latestClosed && rows.length > 0) {
        latestClosed =
          rows.find((r) => r.statementCloseDate !== openClose) ?? rows[0];
      }
      if (latestClosed) {
        const tracked = spendIndex
          ? spendIndex.sumInRange(
              latestClosed.cycleStartDate,
              latestClosed.cycleEndDate
            )
          : 0;
        const interest = await recomputeInterestForStatement(
          supabase,
          userId,
          card,
          latestClosed,
          spendIndex
        );
        statements.push(
          enrichStatement(
            latestClosed,
            { creditCardKey: card.cardKey, cardName: card.name },
            interest,
            tracked
          )
        );
      }

      let carriedForward = 0;
      let interestEstimate = 0;
      const priorClosed = latestClosed;
      if (priorClosed && !priorClosed.paidAt) {
        const priorInterest = await recomputeInterestForStatement(
          supabase,
          userId,
          card,
          priorClosed,
          spendIndex
        );
        carriedForward = outstandingBalance({
          carriedForwardIn: priorClosed.carriedForwardIn,
          actualAmount: priorClosed.actualAmount,
          interestAccrued: priorInterest,
          amountPaid: priorClosed.amountPaid,
        });
        if (
          card.interestRateApr > 0 &&
          spendIndex &&
          today > priorClosed.paymentDueDate &&
          carriedForward > 0
        ) {
          const start = interestStartAfterDue(priorClosed.paymentDueDate);
          const dailySpend = spendIndex.dailySpendInRange(start, today);
          interestEstimate = accrueDailyInterest({
            aprPercent: card.interestRateApr,
            principalAtDue: principalAtDue({
              carriedForwardIn: priorClosed.carriedForwardIn,
              actualAmount: priorClosed.actualAmount,
              amountPaid: priorClosed.amountPaid,
            }),
            dailySpend,
            interestStartDate: start,
            throughDate: today,
          });
        }
      }

      const newSpend = spendIndex
        ? spendIndex.sumInRange(cycleStart, cycleEnd)
        : 0;

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

  console.info("[card-statements] loaded bundle", {
    userId,
    statements: statements.length,
    openCycles: openCycles.length,
  });

  return { configured: true, statements, openCycles };
}

export async function updateStatementFields(
  supabase: SupabaseClient,
  userId: string,
  statementId: string,
  fields: { actualAmount?: number; minimumDue?: number | null },
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

  let tracked = db.trackedAmount ?? 0;
  if (fields.actualAmount != null && card.financialAccountId) {
    tracked = (
      await buildCardSpendIndex(
        supabase,
        userId,
        card.financialAccountId,
        db.cycleStartDate,
        db.cycleEndDate
      )
    ).sumInRange(db.cycleStartDate, db.cycleEndDate);
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

  return enrichStatement(
    mapped,
    { creditCardKey: card.cardKey, cardName: card.name },
    interest,
    mapped.trackedAmount ?? tracked
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
