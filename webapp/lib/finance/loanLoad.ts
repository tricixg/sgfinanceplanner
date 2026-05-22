import type { DashboardState } from "@/lib/types";
import { monIdx } from "./helpers";

export function loanLoadForMonth(
  loans: DashboardState["loans"],
  ym: string
): number {
  const idx = monIdx(ym);
  return loans.reduce(
    (s, l) => s + (monIdx(l.end) >= idx ? l.monthly : 0),
    0
  );
}
