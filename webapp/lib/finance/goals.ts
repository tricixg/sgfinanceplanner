import type { DashboardState } from "@/lib/types";
import { monIdx } from "./helpers";

const NOW_YM = "2026-05";

export function monthsUntil(ym: string): number {
  const now = monIdx(NOW_YM);
  return Math.max(1, monIdx(ym) - now);
}

export function goalsSummary(S: DashboardState) {
  let totT = 0;
  let totS = 0;
  let totMonthly = 0;
  const rows = S.goals.map((g) => {
    const gap = Math.max(0, g.target - g.saved);
    const mths = monthsUntil(g.by);
    const need = gap / mths;
    totT += g.target;
    totS += g.saved;
    totMonthly += need;
    const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
    return { ...g, gap, mths, need, pct };
  });
  return { rows, totT, totS, totMonthly };
}
