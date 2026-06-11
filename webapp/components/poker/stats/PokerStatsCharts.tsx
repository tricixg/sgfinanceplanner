"use client";

import { useState } from "react";
import type { PokerStatsBundle } from "@/lib/poker/stats";
import { PokerBarChart } from "@/components/poker/stats/PokerBarChart";

type Props = { stats: PokerStatsBundle };

type ChartMetric = "hourly" | "netProfit";

export function PokerStatsCharts({ stats }: Props) {
  const [metric, setMetric] = useState<ChartMetric>("hourly");

  return (
    <div className="poker-stats-charts">
      <div className="poker-charts-metric-toggle">
        <span className="poker-trend-control-label">Show</span>
        <div className="poker-fx-segment" role="group" aria-label="Chart metric">
          <button
            type="button"
            className={metric === "hourly" ? "active" : undefined}
            onClick={() => {
              setMetric("hourly");
              console.info("[PokerStatsCharts] metric", "hourly");
            }}
          >
            $/h
          </button>
          <button
            type="button"
            className={metric === "netProfit" ? "active" : undefined}
            onClick={() => {
              setMetric("netProfit");
              console.info("[PokerStatsCharts] metric", "netProfit");
            }}
          >
            Net profit
          </button>
        </div>
      </div>

      <PokerBarChart title="By weekday" buckets={stats.charts.weekday} valueKey={metric} />
      <PokerBarChart title="By month" buckets={stats.charts.month} valueKey={metric} />
      <PokerBarChart title="By year" buckets={stats.charts.year} valueKey={metric} />

      <PokerBarChart
        title="Cash game session length"
        buckets={stats.charts.cashSessionLength}
        valueKey={metric}
      />
    </div>
  );
}
