"use client";

import { useMemo } from "react";
import type { ChartOptions } from "chart.js";
import { ChartBox } from "@/components/ChartBox";
import { fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import type { SpendingAnalyticsBundle } from "@/lib/spending/analytics";
import { colorAt } from "./chart-colors";

type Props = {
  analytics: SpendingAnalyticsBundle;
};

export function SpendingInsightsPanel({ analytics }: Props) {
  const { topCategories, momIncreases, cardShare } = analytics.insights;
  const latestYm = analytics.months[analytics.months.length - 1];

  const doughnut = useMemo(() => {
    if (cardShare.length === 0) return null;
    return {
      labels: cardShare.map((c) => c.label),
      datasets: [
        {
          data: cardShare.map((c) => c.total),
          backgroundColor: cardShare.map((_, i) => colorAt(i)),
        },
      ],
    };
  }, [cardShare]);

  const doughnutOpts = useMemo((): ChartOptions<"doughnut"> => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const share = cardShare[ctx.dataIndex];
              return `${ctx.label}: ${fmt2(Number(ctx.raw))} (${share?.sharePct ?? 0}%)`;
            },
          },
        },
      },
    };
  }, [cardShare]);

  return (
    <div className="grid g2" style={{ marginBottom: 16 }}>
      <div className="card table-scroll">
        <h3 style={{ marginTop: 0 }}>Top categories (5 months)</h3>
        {topCategories.length === 0 ? (
          <p className="note">No category data yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Total</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {topCategories.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td className="num">{fmt2(row.total)}</td>
                  <td className="num">{row.sharePct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card table-scroll">
        <h3 style={{ marginTop: 0 }}>Biggest MoM increases</h3>
        {momIncreases.length === 0 ? (
          <p className="note">No increases vs prior month.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Increase</th>
                <th>Period</th>
              </tr>
            </thead>
            <tbody>
              {momIncreases.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td className="num neg">+{fmt2(row.delta)}</td>
                  <td>
                    {formatMonthLabel(row.fromYm)} → {formatMonthLabel(row.toYm)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <h3 style={{ marginTop: 0 }}>
          Card share — {latestYm ? formatMonthLabel(latestYm) : "latest month"}
        </h3>
        {doughnut ? (
          <ChartBox type="doughnut" data={doughnut} options={doughnutOpts} height={260} />
        ) : (
          <p className="note">No card spending in the latest month.</p>
        )}
      </div>
    </div>
  );
}
