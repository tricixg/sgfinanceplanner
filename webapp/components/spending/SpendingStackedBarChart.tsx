"use client";

import { useMemo } from "react";
import type { SpendingMonthlyRow } from "@/lib/spending/analytics";
import type { CategoryColorFn } from "@/lib/finance/category-colors";
import { MonthlyStackedBarChart } from "./MonthlyStackedBarChart";

type Props = {
  title: string;
  monthly: SpendingMonthlyRow[];
  dimension: "byCategory" | "byCard";
  topN?: number;
  /** When true, omit outer card wrapper (for embedding in a parent card). */
  embedded?: boolean;
  /** Per-category colours shared across pages; falls back to colours by rank. */
  colorFor?: CategoryColorFn;
};

export function SpendingStackedBarChart({ monthly, dimension, ...rest }: Props) {
  const months = useMemo(() => monthly.map((m) => m.ym), [monthly]);
  const itemsByMonth = useMemo(() => monthly.map((m) => m[dimension]), [monthly, dimension]);
  return (
    <MonthlyStackedBarChart
      {...rest}
      months={months}
      itemsByMonth={itemsByMonth}
      emptyText="No spending data in this period."
    />
  );
}
