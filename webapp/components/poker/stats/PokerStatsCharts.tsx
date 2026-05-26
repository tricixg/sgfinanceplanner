"use client";

import type { PokerStatsBundle } from "@/lib/poker/stats";
import { PokerBarChart } from "@/components/poker/stats/PokerBarChart";

type Props = { stats: PokerStatsBundle };

export function PokerStatsCharts({ stats }: Props) {
  return (
    <div className="poker-stats-charts">
      <PokerBarChart title="By weekday ($/h)" buckets={stats.charts.weekday} valueKey="hourly" />
      <PokerBarChart title="By month ($/h)" buckets={stats.charts.month} valueKey="hourly" />
      <PokerBarChart title="By year ($/h)" buckets={stats.charts.year} valueKey="hourly" />
      <PokerBarChart
        title="By year (net profit)"
        buckets={stats.charts.year}
        valueKey="netProfit"
      />
    </div>
  );
}
