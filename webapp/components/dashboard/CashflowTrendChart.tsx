"use client";

import { useMemo } from "react";
import { Chart } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import "@/components/chart-setup";
import { fmt } from "@/lib/finance/helpers";
import { shortMonth, type MonthFlowMap } from "@/lib/dashboard/cashflow";

type Props = {
  flows: MonthFlowMap;
  /** Months to plot, oldest first. */
  months: string[];
  /** Months in the selected period — drawn at full strength; the rest recede. */
  selected: string[];
};

const MOSS = "47, 93, 58";
const RUST = "181, 72, 46";

const compactMoney = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${sign}$${Math.round(abs)}`;
};

export function CashflowTrendChart({ flows, months, selected }: Props) {
  const data = useMemo((): ChartData<"bar"> => {
    const on = new Set(selected);
    const alpha = (ym: string) => (on.has(ym) ? 1 : 0.32);
    const series = (label: string, rgb: string, pick: "income" | "spending") => ({
      label,
      data: months.map((ym) => flows.get(ym)?.[pick] ?? 0),
      backgroundColor: months.map((ym) => `rgba(${rgb}, ${alpha(ym)})`),
      borderRadius: 5,
      maxBarThickness: 26,
      categoryPercentage: 0.62,
      barPercentage: 0.9,
    });
    return {
      labels: months.map((ym) =>
        ym.endsWith("-01") ? `${shortMonth(ym)} ’${ym.slice(2, 4)}` : shortMonth(ym)
      ),
      datasets: [series("Income", MOSS, "income"), series("Spending", RUST, "spending")],
    };
  }, [flows, months, selected]);

  const options = useMemo(
    (): ChartOptions<"bar"> => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${fmt(Number(ctx.parsed.y ?? 0))}`,
            footer: (items) => {
              const income = Number(items[0]?.parsed.y ?? 0);
              const spending = Number(items[1]?.parsed.y ?? 0);
              const net = income - spending;
              return `Net ${net < 0 ? "-" : "+"}${fmt(Math.abs(net))}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: {
          beginAtZero: true,
          border: { display: false },
          ticks: { maxTicksLimit: 5, callback: (v) => compactMoney(Number(v)) },
        },
      },
    }),
    []
  );

  return (
    <div
      className="chart-frame"
      role="img"
      aria-label={`Income and spending by month, ${months.length} months`}
    >
      <Chart type="bar" data={data} options={options} />
    </div>
  );
}
