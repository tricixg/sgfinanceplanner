import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { withLatency } from "@/lib/test-utils/latency-supabase";
import type { DbCreditCard } from "@/lib/credit-cards/mappers";
import { principalAtDue, roundMoney, statementCarryIn } from "@/lib/cards/interest-accrual";
import {
  cycleBoundsFromClose,
  paymentDueDate,
  recentStatementCloseDates,
} from "@/lib/cards/statement-cycle";
import { sgtTodayYmd } from "@/lib/time/sgt";
import { mapCardStatement, type DbCardStatement } from "./mappers";
import { ensureStatementRows } from "./load";

const USER = "u1";
const CARD = { id: "card1", statementDay: 15, paymentDueDay: 5 } as unknown as DbCreditCard;
const HISTORY_CYCLES = 12;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T04:00:00Z"));
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function closingUnpaidForCarry(stmt: DbCardStatement): number {
  if (stmt.paidAt) return 0;
  const principal = principalAtDue({
    carriedForwardIn: statementCarryIn(stmt),
    actualAmount: stmt.actualAmount,
    amountPaid: stmt.amountPaid,
  });
  return roundMoney(principal + stmt.interestAccrued);
}

/**
 * The implementation before PERF-007, verbatim apart from imports: one awaited insert/update
 * per missing/stale row, in cycle order. Kept here as the reference the new loader must
 * agree with row for row, and as the "before" for the round-trip counts below.
 */
async function referenceEnsureStatementRows(
  supabase: SupabaseClient,
  userId: string,
  card: DbCreditCard
): Promise<DbCardStatement[]> {
  const today = sgtTodayYmd();
  const closeDates = recentStatementCloseDates(card.statementDay, HISTORY_CYCLES, today);
  const { data: existing, error } = await supabase
    .from("card_statements")
    .select("*")
    .eq("credit_card_id", card.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const byClose = new Map(
    (existing ?? []).map((r) => [String(r.statement_close_date).slice(0, 10), mapCardStatement(r)])
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
      const mapped = mapCardStatement(inserted as Record<string, unknown>);
      byClose.set(close, mapped);
      priorCarry = today > due && !mapped.paidAt ? closingUnpaidForCarry(mapped) : 0;
    } else {
      const cycleDatesStale = row.cycleStartDate !== cycleStart || row.cycleEndDate !== cycleEnd;
      const carryStale = row.carriedForwardIn !== priorCarry && !row.paidAt;
      if (cycleDatesStale || carryStale) {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (cycleDatesStale) {
          patch.cycle_start_date = cycleStart;
          patch.cycle_end_date = cycleEnd;
        }
        if (carryStale) patch.carried_forward_in = priorCarry;
        const { data: updated, error: updErr } = await supabase
          .from("card_statements")
          .update(patch)
          .eq("id", row.id)
          .select("*")
          .single();
        if (updErr) throw new Error(updErr.message);
        const mapped = mapCardStatement(updated as Record<string, unknown>);
        byClose.set(close, mapped);
        priorCarry = today > due && !mapped.paidAt ? closingUnpaidForCarry(mapped) : 0;
      } else {
        priorCarry = today > due && !row.paidAt ? closingUnpaidForCarry(row) : 0;
      }
    }
  }
  return [...byClose.values()].sort((a, b) => b.statementCloseDate.localeCompare(a.statementCloseDate));
}

const TODAY = "2026-11-17";
const closes = recentStatementCloseDates(CARD.statementDay, HISTORY_CYCLES, TODAY).sort();

function row(closeIdx: number, extra: Record<string, unknown> = {}) {
  const close = closes[closeIdx];
  const { cycleStart, cycleEnd } = cycleBoundsFromClose(close, CARD.statementDay);
  return {
    id: `s${closeIdx}`,
    user_id: USER,
    credit_card_id: CARD.id,
    statement_close_date: close,
    cycle_start_date: cycleStart,
    cycle_end_date: cycleEnd,
    payment_due_date: paymentDueDate(close, CARD.paymentDueDay),
    carried_forward_in: 0,
    actual_amount: null,
    tracked_amount: null,
    amount_paid: 0,
    interest_accrued: 0,
    paid_at: null,
    amount_includes_prior_balance: false,
    minimum_due: null,
    ...extra,
  };
}

const omit = <T extends Record<string, unknown>>(o: T, keys: string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

/** Rows without ids, for comparing two runs that were assigned different ids. */
const shape = (rows: DbCardStatement[]) => rows.map((r) => omit(r, ["id"]));

const SCENARIOS: Record<string, Record<string, unknown>[]> = {
  "a brand-new card (no rows)": [],
  "some rows missing in the middle": [row(0), row(1), row(5), row(9), row(10)],
  "unpaid overdue statements whose carry has gone stale": [
    row(2, { actual_amount: 500, carried_forward_in: 0 }),
    row(3, { actual_amount: 300, carried_forward_in: 12 }),
    row(4, { actual_amount: 200, carried_forward_in: 0, interest_accrued: 7.5 }),
    row(5),
    row(6, { paid_at: "2026-06-20T00:00:00Z", amount_paid: 100, actual_amount: 100 }),
    row(7, { actual_amount: 80, amount_includes_prior_balance: true, carried_forward_in: 3 }),
  ],
  "wrong cycle dates": [row(4, { cycle_start_date: "2026-01-01" }), row(8, { cycle_end_date: "2026-01-31" })],
  "history older than the 12-cycle window is kept": [
    row(0, { statement_close_date: "2024-03-15", cycle_start_date: "2024-02-16", cycle_end_date: "2024-03-15", payment_due_date: "2024-04-05", id: "old" }),
    row(11),
  ],
};

describe("ensureStatementRows (PERF-007)", () => {
  for (const [name, seed] of Object.entries(SCENARIOS)) {
    it(`gives exactly the rows the sequential algorithm gave: ${name}`, async () => {
      const a = createFakeSupabase({ card_statements: seed });
      const b = createFakeSupabase({ card_statements: seed });
      const expected = await referenceEnsureStatementRows(a.client, USER, CARD);
      const actual = await ensureStatementRows(b.client, USER, CARD);
      expect(shape(actual)).toEqual(shape(expected));
      // and what ends up stored is the same too
      const stored = (f: ReturnType<typeof createFakeSupabase>) =>
        f
          .table("card_statements")
          .map((r) => omit(r, ["id", "updated_at"]))
          .sort((x, y) => String(x.statement_close_date).localeCompare(String(y.statement_close_date)));
      expect(stored(b)).toEqual(stored(a));
      // every returned row is a real, stored row (no placeholder ids leak out)
      for (const r of actual) expect(r.id.startsWith("pending:")).toBe(false);
    });
  }

  it("does no writes when every row already exists and is current", async () => {
    const f = createFakeSupabase({ card_statements: [] });
    await ensureStatementRows(f.client, USER, CARD);
    const opsAfterFirst = f.ops.length;
    const again = await ensureStatementRows(f.client, USER, CARD);
    expect(again).toHaveLength(HISTORY_CYCLES);
    expect(f.ops.slice(opsAfterFirst).map((o) => o.kind)).toEqual(["select"]);
  });

  it("creates a new card's 12 rows with one write, not 12 (round-trips: 13 -> 2)", async () => {
    const before = withLatency(createFakeSupabase({ card_statements: [] }).client);
    await referenceEnsureStatementRows(before.client, USER, CARD);
    expect(before.calls).toHaveLength(1 + HISTORY_CYCLES);
    expect(before.depth()).toBe(1 + HISTORY_CYCLES);

    const after = withLatency(createFakeSupabase({ card_statements: [] }).client);
    await ensureStatementRows(after.client, USER, CARD);
    expect(after.calls).toHaveLength(2);
    expect(after.depth()).toBe(2);
  });

  it("corrects stale rows in parallel (round-trips: 1 + N -> 2)", async () => {
    const seed = SCENARIOS["unpaid overdue statements whose carry has gone stale"];
    const before = withLatency(createFakeSupabase({ card_statements: seed }).client);
    await referenceEnsureStatementRows(before.client, USER, CARD);
    const after = withLatency(createFakeSupabase({ card_statements: seed }).client);
    await ensureStatementRows(after.client, USER, CARD);
    expect(after.depth()).toBeLessThan(before.depth());
    expect(after.depth()).toBe(2);
  });

  it("survives another request creating the same rows at the same time (was a 500)", async () => {
    const f = createFakeSupabase({ card_statements: [] });
    // The other request lands its inserts between our read and our write.
    const racer = {
      from: (t: string) => {
        const b = (f.client as unknown as { from: (t: string) => Record<string, unknown> }).from(t);
        if (t !== "card_statements") return b;
        const realUpsert = b.upsert as (...a: unknown[]) => unknown;
        let raced = false;
        b.upsert = (...args: unknown[]) => {
          if (!raced) {
            raced = true;
            void (async () => {
              await (f.client as unknown as { from: (t: string) => { insert: (p: unknown) => Promise<unknown> } })
                .from("card_statements")
                .insert([row(0), row(3), row(11)].map((r) => omit(r, ["id"])));
            })();
          }
          return realUpsert(...args);
        };
        return b;
      },
      rpc: (f.client as unknown as { rpc: unknown }).rpc,
    } as unknown as SupabaseClient;

    const rows = await ensureStatementRows(racer, USER, CARD);
    // the conflict was really hit and handled by re-reading, not avoided by luck
    expect(console.info).toHaveBeenCalledWith(
      "[card-statements] concurrent row creation; re-reading",
      expect.objectContaining({ planned: HISTORY_CYCLES, inserted: HISTORY_CYCLES - 3 })
    );
    expect(rows).toHaveLength(HISTORY_CYCLES);
    expect(new Set(rows.map((r) => r.statementCloseDate)).size).toBe(HISTORY_CYCLES);
    expect(f.table("card_statements")).toHaveLength(HISTORY_CYCLES);
    for (const r of rows) expect(r.id.startsWith("pending:")).toBe(false);
  });

  it("two loads at once (e.g. two tabs) both succeed and leave exactly one row per cycle", async () => {
    const f = createFakeSupabase({ card_statements: [] });
    const [a, b] = await Promise.all([
      ensureStatementRows(f.client, USER, CARD),
      ensureStatementRows(f.client, USER, CARD),
    ]);
    expect(a).toHaveLength(HISTORY_CYCLES);
    expect(b).toHaveLength(HISTORY_CYCLES);
    expect(f.table("card_statements")).toHaveLength(HISTORY_CYCLES);
    expect(new Set(f.table("card_statements").map((r) => r.statement_close_date)).size).toBe(HISTORY_CYCLES);
    // Whatever each caller got back refers to real rows, never a "pending:" placeholder.
    for (const r of [...a, ...b]) expect(r.id.startsWith("pending:")).toBe(false);
  });

  it("still surfaces a real database error", async () => {
    const f = createFakeSupabase({}, { failOn: (op) => (op.kind === "upsert" ? "db down" : null) });
    await expect(ensureStatementRows(f.client, USER, CARD)).rejects.toThrow("db down");
  });
});
