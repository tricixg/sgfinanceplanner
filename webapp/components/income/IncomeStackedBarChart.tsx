"use client";

import { useMemo } from "react";
import type { ChartOptions } from "chart.js";
import { ChartBox } from "@/components/ChartBox";
import { colorAt } from "@/components/spending/chart-colors";
import { fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import type { IncomeMonthlyRow } from "@/lib/income/analytics";

type Props = {
  title: string;
  monthly: IncomeMonthlyRow[];
  dimension: "byCategory" | "byAccount";
  topN?: number;
  /** When true, omit outer card wrapper (for embedding in a parent card). */
  embedded?: boolean;
};

const OTHER_ID = "__other__";

export function IncomeStackedBarChart({
  title,
  monthly,
  dimension,
  topN = 7,
  embedded = false,
}: Props) {
  const chart = useMemo(() => {
    const totals = new Map<string, { label: string; total: number }>();
    for (const row of monthly) {
      for (const item of row[dimension]) {
        const prev = totals.get(item.id) ?? { label: item.label, total: 0 };
        prev.total += item.amount;
        totals.set(item.id, prev);
      }
    }

    const ranked = [...totals.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, topN);
    const topIds = new Set(ranked.map(([id]) => id));

    const series = ranked.map(([id, meta], i) => ({
      id,
      label: meta.label,
      color: colorAt(i),
      data: monthly.map((row) => {
        const match = row[dimension].find((r) => r.id === id);
        return match?.amount ?? 0;
      }),
    }));

    if (totals.size > topN) {
      series.push({
        id: OTHER_ID,
        label: "Other",
        color: "#c4bdb0",
        data: monthly.map((row) => {
          let other = 0;
          for (const item of row[dimension]) {
            if (!topIds.has(item.id)) other += item.amount;
          }
          return Math.round(other * 100) / 100;
        }),
      });
    }

    return {
      labels: monthly.map((m) => formatMonthLabel(m.ym)),
      datasets: series.map((s) => ({
        label: s.label,
        data: s.data,
        backgroundColor: s.color,
        stack: "income",
      })),
    };
  }, [monthly, dimension, topN]);

  const options = useMemo((): ChartOptions<"bar"> => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          mode: "index",
          callbacks: {
            label: (ctx) => `${ctx.dataset.label ?? ""}: ${fmt2(Number(ctx.raw))}`,
            footer: (items) => {
              if (items.length === 0) return "";
              const total = items.reduce((s, item) => s + Number(item.raw ?? 0), 0);
              return `Total: ${fmt2(total)}`;
            },
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          grid: { color: "#e6dfca" },
          ticks: {
            callback: (v) => "$" + (Number(v) / 1000).toFixed(1) + "k",
          },
        },
      },
    };
  }, []);

  const hasData = chart.datasets.some((d) => d.data.some((v) => Number(v) > 0));
  if (!hasData) {
    const empty = <p className="note">No income data in this period.</p>;
    if (embedded) return empty;
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        {title ? <h3 style={{ marginTop: 0 }}>{title}</h3> : null}
        {empty}
      </div>
    );
  }

  const chartEl = <ChartBox type="bar" data={chart} options={options} height={280} />;
  if (embedded) return chartEl;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {title ? <h3 style={{ marginTop: 0 }}>{title}</h3> : null}
      {chartEl}
    </div>
  );
}
