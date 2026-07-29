"use client";

import { fmt2 } from "@/lib/finance/helpers";
import type { IncomeAnalyticsBundle } from "@/lib/income/analytics";

type Props = {
  analytics: IncomeAnalyticsBundle;
};

function formatMom(pct: number | null | undefined): string {
  if (pct == null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function IncomeKpiStrip({ analytics }: Props) {
  const monthly = analytics.monthly;
  const grandTotal = monthly.reduce((s, m) => s + m.total, 0);
  const avg = monthly.length > 0 ? grandTotal / monthly.length : 0;
  const latest = monthly[monthly.length - 1];
  const latestMom = latest ? analytics.insights.momChangePct[latest.ym] : null;

  return (
    <div className="grid g4" style={{ marginBottom: 16 }}>
      <div className="stat accent">
        <div className="lbl">5-month total</div>
        <div className="val">{fmt2(grandTotal)}</div>
      </div>
      <div className="stat">
        <div className="lbl">Avg / month</div>
        <div className="val">{fmt2(avg)}</div>
      </div>
      <div className="stat">
        <div className="lbl">Latest month</div>
        <div className="val">{fmt2(latest?.total ?? 0)}</div>
      </div>
      <div className="stat">
        <div className="lbl">MoM change</div>
        <div className={`val ${(latestMom ?? 0) < 0 ? "neg" : ""}`}>
          {formatMom(latestMom)}
        </div>
      </div>
    </div>
  );
}
