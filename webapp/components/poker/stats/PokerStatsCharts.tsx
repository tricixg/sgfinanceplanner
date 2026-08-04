"use client";

import { useMemo, useState } from "react";
import type { PokerStatsBundle } from "@/lib/poker/stats";
import { pokerChartYears, pokerMonthBuckets } from "@/lib/poker/stats";
import { PokerBarChart } from "@/components/poker/stats/PokerBarChart";

type Props = { stats: PokerStatsBundle };

type ChartMetric = "hourly" | "netProfit";

const ALL_YEARS = "all";

export function PokerStatsCharts({ stats }: Props) {
  const [metric, setMetric] = useState<ChartMetric>("netProfit");
  const [monthYear, setMonthYear] = useState<string>(ALL_YEARS);

  const years = useMemo(() => pokerChartYears(stats.sessions), [stats.sessions]);
  const monthBuckets = useMemo(
    () => pokerMonthBuckets(stats.sessions, monthYear === ALL_YEARS ? undefined : monthYear),
    [stats.sessions, monthYear]
  );

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

      <div className="poker-charts-metric-toggle">
        <label className="tx-filter" htmlFor="poker-month-year">
          <span className="tx-filter-label">Year</span>
          <select
            id="poker-month-year"
            value={monthYear}
            aria-label="Filter by month for year"
            onChange={(e) => {
              const value = e.target.value;
              console.info("[PokerStatsCharts] monthYear", value);
              setMonthYear(value);
            }}
          >
            <option value={ALL_YEARS}>All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      <PokerBarChart title="By month" buckets={monthBuckets} valueKey={metric} />
      <PokerBarChart title="By year" buckets={stats.charts.year} valueKey={metric} />

      <PokerBarChart
        title="Cash game session length"
        buckets={stats.charts.cashSessionLength}
        valueKey={metric}
      />
    </div>
  );
}
