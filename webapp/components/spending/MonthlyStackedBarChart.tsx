"use client";

import { useMemo } from "react";
import type { ChartOptions } from "chart.js";
import { ChartBox } from "@/components/ChartBox";
import { fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import { OTHER_CATEGORY_COLOR, type CategoryColorFn } from "@/lib/finance/category-colors";
import { colorAt, SPENDING_CHART_COLORS } from "./chart-colors";
import { buildStackedSeries, OTHER_SERIES_ID, type StackedItem } from "./stacked-series";

type Props = {
  title: string;
  /** Month keys (YYYY-MM), one per bar. */
  months: string[];
  /** Items for each month, aligned with `months`. Pass a memoised array. */
  itemsByMonth: StackedItem[][];
  /** Shown when there is nothing to chart. */
  emptyText: string;
  topN?: number;
  /** When true, omit outer card wrapper (for embedding in a parent card). */
  embedded?: boolean;
  /** Per-category colours shared across pages; falls back to colours by rank. */
  colorFor?: CategoryColorFn;
};

/** How many of each month's largest items are guaranteed their own segment. */
const PER_MONTH_TOP = 6;

/** Stacked monthly bars for spending or income, broken down by category, card or account. */
export function MonthlyStackedBarChart({
  title,
  months,
  itemsByMonth,
  emptyText,
  topN = SPENDING_CHART_COLORS.length,
  embedded = false,
  colorFor,
}: Props) {
  const { chart, otherMembers } = useMemo(() => {
    const { series, otherMembers } = buildStackedSeries(itemsByMonth, PER_MONTH_TOP, topN);
    let colorIdx = 0;
    return {
      otherMembers,
      chart: {
        labels: months.map((ym) => formatMonthLabel(ym)),
        datasets: series.map((s) => ({
          label: s.label,
          data: s.data,
          backgroundColor:
            s.id === OTHER_SERIES_ID
              ? OTHER_CATEGORY_COLOR
              : colorFor
                ? colorFor(s.id, s.label)
                : colorAt(colorIdx++),
          stack: "stack",
          isOther: s.id === OTHER_SERIES_ID,
        })),
      },
    };
  }, [months, itemsByMonth, topN, colorFor]);

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
          filter: (item) => Number(item.raw) > 0,
          itemSort: (a, b) => Number(b.raw) - Number(a.raw),
          callbacks: {
            label: (ctx) => `${ctx.dataset.label ?? ""}: ${fmt2(Number(ctx.raw))}`,
            afterLabel: (ctx) => {
              if (!(ctx.dataset as { isOther?: boolean }).isOther) return "";
              const members = otherMembers[ctx.dataIndex] ?? [];
              return members.map((m) => `   ${m.label}: ${fmt2(m.amount)}`);
            },
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
  }, [otherMembers]);

  const hasData = chart.datasets.some((d) => d.data.some((v) => Number(v) > 0));
  if (!hasData) {
    const empty = <p className="note">{emptyText}</p>;
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
