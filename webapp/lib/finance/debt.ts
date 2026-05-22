import type { DashboardState } from "@/lib/types";
import { monIdx } from "./helpers";

export function debtBurnDown(S: DashboardState) {
  const labels: string[] = [];
  const data: number[] = [];
  const loanState = S.loans.map((l) => ({ ...l, bal: l.out }));

  for (let i = monIdx("2026-06"); i <= monIdx("2027-12"); i++) {
    labels.push(
      new Date(Math.floor(i / 12), i % 12, 1).toLocaleDateString("en-GB", {
        month: "short",
        year: "2-digit",
      })
    );
    const tot = loanState.reduce((s, l) => s + Math.max(0, l.bal), 0);
    data.push(tot);
    loanState.forEach((l) => {
      if (monIdx(l.end) >= i && l.bal > 0) {
        const isFinal = monIdx(l.end) === i;
        l.bal -= isFinal ? l.bal : Math.min(l.monthly || l.bal, l.bal);
      }
    });
  }
  return { labels, data, totalOut: S.loans.reduce((s, l) => s + l.out, 0) };
}

export function sortedLoans(S: DashboardState, nowYm = "2026-06") {
  const nowIdx = monIdx(nowYm);
  return [...S.loans].sort((a, b) => monIdx(a.end) - monIdx(b.end)).map((l) => {
    const ei = monIdx(l.end);
    let tag: string;
    let cls: string;
    if (ei <= nowIdx) {
      tag = "ending";
      cls = "t-end";
    } else if (ei <= nowIdx + 2) {
      tag = "soon";
      cls = "t-soon";
    } else {
      tag = "active";
      cls = "t-live";
    }
    const endLbl = new Date(l.end + "-01").toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
    return { ...l, tag, cls, endLbl };
  });
}
