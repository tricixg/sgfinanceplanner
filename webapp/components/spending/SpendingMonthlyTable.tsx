"use client";

import { fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import type { SpendingAnalyticsBundle } from "@/lib/spending/analytics";

type Props = {
  analytics: SpendingAnalyticsBundle;
};

function formatMom(pct: number | null | undefined): string {
  if (pct == null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function SpendingMonthlyTable({ analytics }: Props) {
  const rows = [...analytics.monthly].reverse();

  return (
    <div className="card table-scroll" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Monthly summary</h3>
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th className="num">Total</th>
            <th className="num">MoM</th>
            <th>Top category</th>
            <th>Top card</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const topCat = row.byCategory[0];
            const topCard = row.byCard[0];
            const mom = analytics.insights.momChangePct[row.ym];
            return (
              <tr key={row.ym}>
                <td>{formatMonthLabel(row.ym)}</td>
                <td className="num">{fmt2(row.total)}</td>
                <td className={`num ${(mom ?? 0) > 0 ? "neg" : ""}`}>
                  {formatMom(mom)}
                </td>
                <td>
                  {topCat ? `${topCat.label} (${fmt2(topCat.amount)})` : "—"}
                </td>
                <td>
                  {topCard ? `${topCard.label} (${fmt2(topCard.amount)})` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
