"use client";

import { useEffect, useState } from "react";
import type { PortfolioSnapshot } from "@/lib/types";
import { ChartBox } from "@/components/ChartBox";
import { fmt, formatMonthLabel } from "@/lib/finance/helpers";
import type { NetWorthMonthPoint } from "@/app/api/accounts/net-worth-history/route";

type View = "line" | "mom";
type Period = "1y" | "2y" | "all";

type Props = {
  portfolioHistory: PortfolioSnapshot[];
  accountsConfigured: boolean;
};

function buildMonthlyNetWorth(
  cashPoints: NetWorthMonthPoint[],
  portfolioHistory: PortfolioSnapshot[]
): { month: string; cash: number; investments: number; total: number }[] {
  // Map portfolio snapshots by month (keep last per month)
  const portByMonth: Record<string, number> = {};
  for (const snap of portfolioHistory) {
    const ym = snap.recordedAt.slice(0, 7);
    portByMonth[ym] = snap.totalValue;
  }

  // Fill portfolio value forward from oldest known month
  const months = cashPoints.map((p) => p.month);
  let lastPort = 0;
  return months.map((ym, i) => {
    if (portByMonth[ym] !== undefined) lastPort = portByMonth[ym];
    return {
      month: ym,
      cash: cashPoints[i].cashTotal,
      investments: lastPort,
      total: cashPoints[i].cashTotal + lastPort,
    };
  });
}

function filterByPeriod(
  data: { month: string }[],
  period: Period
): { month: string }[] {
  if (period === "all") return data;
  const now = new Date();
  const cutoff = new Date(now);
  if (period === "1y") cutoff.setFullYear(cutoff.getFullYear() - 1);
  else cutoff.setFullYear(cutoff.getFullYear() - 2);
  const cutoffYm = cutoff.toISOString().slice(0, 7);
  return data.filter((d) => d.month >= cutoffYm);
}

export function NetWorthGrowthChart({ portfolioHistory, accountsConfigured }: Props) {
  const [view, setView] = useState<View>("line");
  const [period, setPeriod] = useState<Period>("1y");
  const [cashPoints, setCashPoints] = useState<NetWorthMonthPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accountsConfigured) return;
    setLoading(true);
    setError("");
    fetch("/api/accounts/net-worth-history?months=36")
      .then((r) => r.json())
      .then((data) => {
        if (data.items) setCashPoints(data.items as NetWorthMonthPoint[]);
      })
      .catch(() => setError("Could not load history"))
      .finally(() => setLoading(false));
  }, [accountsConfigured]);

  const combined = buildMonthlyNetWorth(cashPoints, portfolioHistory);
  const filtered = filterByPeriod(combined, period) as typeof combined;

  const hasData = filtered.length >= 2;

  // Line chart data
  const lineData = {
    labels: filtered.map((d) => formatMonthLabel(d.month)),
    datasets: [
      {
        label: "Net Worth",
        data: filtered.map((d) => d.total),
        borderColor: "var(--accent, #7c6f5b)",
        backgroundColor: "rgba(124,111,91,0.12)",
        fill: true,
        tension: 0.3,
        pointRadius: filtered.length > 18 ? 2 : 4,
        pointHoverRadius: 6,
      },
      ...(filtered.some((d) => d.investments > 0)
        ? [
            {
              label: "Cash",
              data: filtered.map((d) => d.cash),
              borderColor: "#6b9e78",
              backgroundColor: "transparent",
              fill: false,
              tension: 0.3,
              borderDash: [4, 3],
              pointRadius: 0,
            },
          ]
        : []),
    ],
  };

  // MoM change bar chart data
  const momData = filtered.slice(1).map((d, i) => ({
    month: d.month,
    label: formatMonthLabel(d.month),
    delta: d.total - filtered[i].total,
  }));

  const barData = {
    labels: momData.map((d) => d.label),
    datasets: [
      {
        label: "Monthly Change",
        data: momData.map((d) => d.delta),
        backgroundColor: momData.map((d) =>
          d.delta >= 0 ? "rgba(107,158,120,0.8)" : "rgba(194,100,100,0.8)"
        ),
        borderColor: momData.map((d) =>
          d.delta >= 0 ? "#6b9e78" : "#c26464"
        ),
        borderWidth: 1,
        borderRadius: 3,
      },
    ],
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        display: filtered.some((d) => d.investments > 0),
        position: "bottom" as const,
        labels: { boxWidth: 12, padding: 12 },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; raw: unknown }) =>
            ` ${ctx.dataset.label}: ${fmt(Number(ctx.raw))}`,
        },
      },
    },
    scales: {
      y: {
        ticks: {
          callback: (v: unknown) => fmt(Number(v)),
        },
      },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { raw: unknown }) => {
            const v = Number(ctx.raw);
            return ` ${v >= 0 ? "+" : ""}${fmt(v)}`;
          },
        },
      },
    },
    scales: {
      y: {
        ticks: {
          callback: (v: unknown) => {
            const n = Number(v);
            return `${n >= 0 ? "+" : ""}${fmt(n)}`;
          },
        },
      },
    },
  };

  // Summary stats for MoM view
  const yearPoints = filterByPeriod(combined, "1y") as typeof combined;
  const ytdDelta =
    yearPoints.length >= 2
      ? yearPoints[yearPoints.length - 1].total - yearPoints[0].total
      : null;

  return (
    <div style={{ marginTop: 24 }}>
      <div className="section-head" style={{ marginBottom: 8 }}>
        <h2 style={{ marginBottom: 0 }}>Net worth growth</h2>
        <div className="toolbar" style={{ marginTop: 0, gap: 6 }}>
          <div className="btn-group" role="group" aria-label="View">
            <button
              type="button"
              className={`btn sm${view === "line" ? "" : " ghost"}`}
              onClick={() => setView("line")}
            >
              Line
            </button>
            <button
              type="button"
              className={`btn sm${view === "mom" ? "" : " ghost"}`}
              onClick={() => setView("mom")}
            >
              MoM
            </button>
          </div>
          <div className="btn-group" role="group" aria-label="Period">
            {(["1y", "2y", "all"] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                className={`btn sm${period === p ? "" : " ghost"}`}
                onClick={() => setPeriod(p)}
              >
                {p === "1y" ? "1Y" : p === "2y" ? "2Y" : "All"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        {!accountsConfigured ? (
          <p className="note" style={{ fontStyle: "italic" }}>
            Sign in to see net worth history from your account transactions.
          </p>
        ) : loading ? (
          <p className="note">Loading history…</p>
        ) : error ? (
          <p className="note" style={{ color: "var(--danger, #c26464)" }}>{error}</p>
        ) : !hasData ? (
          <p className="note" style={{ fontStyle: "italic" }}>
            Record account transactions to build your net worth history.
          </p>
        ) : (
          <>
            {view === "line" ? (
              <ChartBox type="line" height={260} data={lineData} options={lineOptions} />
            ) : (
              <>
                {ytdDelta !== null && (
                  <div style={{ marginBottom: 12, display: "flex", gap: 24 }}>
                    <div>
                      <div className="note" style={{ fontSize: 11, marginBottom: 2 }}>
                        12-month change
                      </div>
                      <div
                        style={{
                          fontWeight: 600,
                          color: ytdDelta >= 0 ? "#6b9e78" : "#c26464",
                        }}
                      >
                        {ytdDelta >= 0 ? "+" : ""}
                        {fmt(ytdDelta)}
                      </div>
                    </div>
                  </div>
                )}
                {momData.length === 0 ? (
                  <p className="note" style={{ fontStyle: "italic" }}>
                    Not enough data for the selected period.
                  </p>
                ) : (
                  <ChartBox type="bar" height={260} data={barData} options={barOptions} />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
