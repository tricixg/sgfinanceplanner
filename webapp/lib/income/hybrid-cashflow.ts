import type { DashboardState } from "@/lib/types";
import { stableTakeHome } from "@/lib/finance/income";

export function monthCashIncome(
  S: DashboardState,
  ym: string,
  additiveIncomeByYm: Record<string, number> = {}
): { baseline: number; additive: number; total: number } {
  const baseline = stableTakeHome(S);
  const additive = additiveIncomeByYm[ym] ?? 0;
  return { baseline, additive, total: baseline + additive };
}
