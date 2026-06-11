"use client";

import { useMemo } from "react";
import { Chart } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { ensureChartsRegistered } from "@/components/chart-setup";
import type { LocationDetailStats } from "@/lib/poker/stats";
import { pokerProfitSgd } from "@/lib/fx/convert";
import {
  formatSessionAmountWithSgd,
  formatSessionPlCell,
} from "@/lib/poker/format-session-amount";
import {
  formatHourly,
  formatPct,
  formatPl,
  formatSessionDate,
  plClass,
} from "@/components/poker/stats/format";

ensureChartsRegistered();

type Props = {
  detail: LocationDetailStats;
  onBack: () => void;
};

export function PokerStatsLocationDetail({ detail, onBack }: Props) {
  const lineChart = useMemo(() => {
    if (detail.cumulativeProfit.length < 2) return null;
    return {
      labels: detail.cumulativeProfit.map((p) => p.date),
      datasets: [
        {
          label: "Cumulative profit",
          data: detail.cumulativeProfit.map((p) => p.profit),
          borderColor: "#3d6b8e",
          backgroundColor: "rgba(61,107,142,.12)",
          fill: true,
          tension: 0.2,
        },
      ],
    };
  }, [detail.cumulativeProfit]);

  const lineOpts: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        ticks: {
          callback: (v) => "$" + Number(v).toFixed(0),
        },
      },
    },
  };

  return (
    <>
      <div className="section-head" style={{ width: "100%", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{detail.location}</h2>
        <button type="button" className="btn ghost sm" onClick={onBack}>
          ← All locations
        </button>
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="stat accent">
          <div className="lbl">Net profit</div>
          <div className={`val ${plClass(detail.totals.netProfit)}`}>
            {formatPl(detail.totals.netProfit)}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Sessions</div>
          <div className="val">
            {detail.cash.sessions + detail.tournament.sessions}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">ROI</div>
          <div className="val">
            {formatPct(
              detail.totals.buyIn > 0
                ? (detail.totals.netProfit / detail.totals.buyIn) * 100
                : null
            )}
          </div>
        </div>
      </div>

      {lineChart ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Profit over time</h3>
          <div style={{ height: 240 }}>
            <Chart type="line" data={lineChart} options={lineOpts} />
          </div>
        </div>
      ) : null}

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Cash game</h3>
          <p className="note">
            {detail.cash.sessions} sessions · {detail.cash.hours ? fmt2(detail.cash.hours) : 0}h ·{" "}
            {formatHourly(detail.cash.hourly)} · {formatPct(detail.cash.wonPct)} won
          </p>
          <p className={`${plClass(detail.cash.netProfit)}`} style={{ fontWeight: 600 }}>
            {formatPl(detail.cash.netProfit)}
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Tournament</h3>
          <p className="note">
            {detail.tournament.sessions} sessions ·{" "}
            {detail.tournament.hours ? fmt2(detail.tournament.hours) : 0}h ·{" "}
            {formatHourly(detail.tournament.hourly)} · {formatPct(detail.tournament.wonPct)} won
          </p>
          <p className={`${plClass(detail.tournament.netProfit)}`} style={{ fontWeight: 600 }}>
            {formatPl(detail.tournament.netProfit)}
          </p>
        </div>
      </div>

      {detail.byGame.length > 0 ? (
        <div className="card table-scroll poker-stats-table-scroll" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>By game (cash)</h3>
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th className="num">Hours</th>
                <th className="num">$/h</th>
                <th className="num">Profit</th>
              </tr>
            </thead>
            <tbody>
              {detail.byGame.map((g) => (
                <tr key={g.key}>
                  <td>{g.label}</td>
                  <td className="num">{g.hours ? fmt2(g.hours) : "—"}</td>
                  <td className={`num ${plClass(g.hourly ?? 0)}`}>{formatHourly(g.hourly)}</td>
                  <td className={`num ${plClass(g.netProfit)}`}>{formatPl(g.netProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="card table-scroll poker-stats-table-scroll">
        <h3 style={{ marginTop: 0 }}>Sessions at this location</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Buy-in</th>
              <th className="num">P/L</th>
            </tr>
          </thead>
          <tbody>
            {detail.sessions.map((s) => {
              const pl = pokerProfitSgd(s);
              return (
                <tr key={s.id}>
                  <td>{formatSessionDate(s.playedAt)}</td>
                  <td>{s.sessionType === "tournament" ? "MTT" : "Cash"}</td>
                  <td className="num">{formatSessionAmountWithSgd(s.buyIn, s)}</td>
                  <td className={`num ${plClass(pl)}`}>{formatSessionPlCell(s)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
