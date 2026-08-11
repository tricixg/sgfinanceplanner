import type { DashboardState } from "@/lib/types";
import { stableTakeHome } from "@/lib/finance/income";
import { currentYm } from "@/lib/finance/helpers";

export function monthCashIncome(
  S: DashboardState,
  ym: string,
  additiveIncomeByYm: Record<string, number> = {},
  actualBaselineByYm: Record<string, number> = {}
): { baseline: number; additive: number; total: number; baselineIsActual: boolean } {
  const baselineIsActual = ym <= currentYm() && ym in actualBaselineByYm;
  const baseline = baselineIsActual ? actualBaselineByYm[ym] : stableTakeHome(S);
  const additive = additiveIncomeByYm[ym] ?? 0;
  return { baseline, additive, total: baseline + additive, baselineIsActual };
}
