"use client";

import { useMemo } from "react";
import { Chart } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import "@/components/chart-setup";
import { fmt } from "@/lib/finance/helpers";
import { shortMonth } from "@/lib/dashboard/cashflow";
import type { NetWorthPoint } from "@/lib/dashboard/health";

type Props = {
  /** Month-end snapshots plus, optionally, today's live figure as the last point. */
  points: NetWorthPoint[];
};

export function NetWorthTrendChart({ points }: Props) {
  const data = useMemo(
    (): ChartData<"line"> => ({
      labels: points.map((p) =>
        p.month.endsWith("-01") ? `${shortMonth(p.month)} ’${p.month.slice(2, 4)}` : shortMonth(p.month)
      ),
      datasets: [
        {
          label: "Net worth",
          data: points.map((p) => p.value),
          borderColor: "#2f5d3a",
          borderWidth: 2,
          backgroundColor: "rgba(47, 93, 58, 0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: points.map((_, i) => (i === points.length - 1 ? 3.5 : 0)),
          pointHoverRadius: 4,
          pointBackgroundColor: "#2f5d3a",
          pointBorderColor: "#fffdf6",
          pointBorderWidth: 2,
        },
      ],
    }),
    [points]
  );

  const options = useMemo(
    (): ChartOptions<"line"> => ({
      responsive: true,
      maintainAspectRatio: false,
      // Figures settle in two steps after mount; animating the second looks like a reload.
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: { label: (ctx) => fmt(Number(ctx.parsed.y ?? 0)) },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { maxTicksLimit: 6, maxRotation: 0 },
        },
        y: {
          border: { display: false },
          ticks: {
            maxTicksLimit: 4,
            callback: (v) => `$${(Number(v) / 1000).toFixed(0)}k`,
          },
        },
      },
    }),
    []
  );

  return (
    <div
      className="chart-frame sm"
      role="img"
      aria-label={`Net worth over ${points.length} months`}
    >
      <Chart type="line" data={data} options={options} />
    </div>
  );
}
