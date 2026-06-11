"use client";

import { fmt2 } from "@/lib/finance/helpers";
import type { SpendingAnalyticsBundle } from "@/lib/spending/analytics";

type Props = {
  analytics: SpendingAnalyticsBundle;
};

export function SpendingBudgetVarianceTable({ analytics }: Props) {
  const rows = analytics.insights.budgetVariance;
  if (rows.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Budget variance (5 months)</h3>
        <p className="note">No spend-type budget lines with allocations yet.</p>
      </div>
    );
  }

  const monthCount = analytics.months.length;

  return (
    <div className="card table-scroll" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Budget variance (5 months)</h3>
      <p className="note" style={{ marginTop: 0 }}>
        Compares total spend vs budget allocation across the selected period (spend categories
        only).
      </p>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Monthly budget</th>
            <th className="num">5-mo budget</th>
            <th className="num">5-mo spent</th>
            <th className="num">Avg / mo</th>
            <th className="num">Over / under</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const monthlyAlloc =
              analytics.budgetByCategory.find((b) => b.id === row.id)?.monthlyAllocated ?? 0;
            const avg = monthCount > 0 ? row.spent / monthCount : 0;
            return (
              <tr key={row.id}>
                <td>{row.label}</td>
                <td className="num">{fmt2(monthlyAlloc)}</td>
                <td className="num">{fmt2(row.allocated)}</td>
                <td className="num">{fmt2(row.spent)}</td>
                <td className="num">{fmt2(avg)}</td>
                <td className={`num ${row.over > 0 ? "neg" : ""}`}>
                  {row.over > 0 ? "+" : ""}
                  {fmt2(row.over)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
