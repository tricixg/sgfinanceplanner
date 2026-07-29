"use client";

import { fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import type { IncomeAnalyticsBundle } from "@/lib/income/analytics";

type Props = {
  analytics: IncomeAnalyticsBundle;
};

function formatMom(pct: number | null | undefined): string {
  if (pct == null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function IncomeMonthlyTable({ analytics }: Props) {
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
            <th>Top account</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const topCat = row.byCategory[0];
            const topAccount = row.byAccount[0];
            const mom = analytics.insights.momChangePct[row.ym];
            return (
              <tr key={row.ym}>
                <td>{formatMonthLabel(row.ym)}</td>
                <td className="num">{fmt2(row.total)}</td>
                <td className={`num ${(mom ?? 0) < 0 ? "neg" : ""}`}>
                  {formatMom(mom)}
                </td>
                <td>
                  {topCat ? `${topCat.label} (${fmt2(topCat.amount)})` : "—"}
                </td>
                <td>
                  {topAccount ? `${topAccount.label} (${fmt2(topAccount.amount)})` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
