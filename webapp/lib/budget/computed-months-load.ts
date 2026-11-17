import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pickComputedLines,
  type ComputedMonthLines,
  type ComputedMonthMap,
} from "@/lib/finance/computed-months";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

/** Postgres "relation does not exist" / PostgREST "table not in schema cache". */
function isMissingTable(error: { message?: string; code?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|schema cache/i.test(error.message ?? "")
  );
}

/**
 * Frozen monthly computed lines, keyed by YYYY-MM. Returns {} when migration
 * 068 hasn't been applied yet, so the app keeps working (live settings) until it is.
 */
export async function loadComputedMonths(
  supabase: SupabaseClient,
  userId: string
): Promise<ComputedMonthMap> {
  type Row = { month: unknown; insurance: unknown; ilp: unknown; debt: unknown };
  let rows: Row[];
  try {
    rows = await fetchAllRows<Row>((from, to) =>
      supabase
        .from("monthly_computed_lines")
        .select("month, insurance, ilp, debt")
        .eq("user_id", userId)
        .order("month")
        .range(from, to)
    );
  } catch (e) {
    const err = e as { message?: string };
    if (isMissingTable(err)) {
      console.warn("[computed-months] monthly_computed_lines missing — run migration 068");
      return {};
    }
    throw e;
  }
  const out: ComputedMonthMap = {};
  for (const r of rows) {
    out[String(r.month)] = {
      insurance: Number(r.insurance ?? 0),
      ilp: Number(r.ilp ?? 0),
      debt: Number(r.debt ?? 0),
    };
  }
  return out;
}

/**
 * The computed lines to use for `ym` on the server: the frozen snapshot when
 * `ym` is a finished month that has one, else `live` (current settings).
 */
export async function resolveComputedLinesForMonth(
  supabase: SupabaseClient,
  userId: string,
  ym: string,
  live: ComputedMonthLines,
  nowYm: string
): Promise<ComputedMonthLines> {
  if (ym >= nowYm) return live;
  const snapshots = await loadComputedMonths(supabase, userId);
  return pickComputedLines(snapshots, live, ym, nowYm);
}

/**
 * Freeze a month's computed lines (the month-end job). Overwrites any earlier row for the
 * month, so a mid-month test run is corrected by the real run on the last day.
 */
export async function saveComputedMonth(
  supabase: SupabaseClient,
  userId: string,
  month: string,
  lines: ComputedMonthLines
): Promise<void> {
  const { error } = await supabase.from("monthly_computed_lines").upsert(
    {
      user_id: userId,
      month,
      insurance: round2(lines.insurance),
      ilp: round2(lines.ilp),
      debt: round2(lines.debt),
    },
    { onConflict: "user_id,month" }
  );
  if (error) throw new Error(error.message);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
