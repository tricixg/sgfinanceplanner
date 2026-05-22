"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardState } from "@/lib/types";
import { monthlyInvestContribution, simulate5y } from "@/lib/finance";
import { fmt } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";
import type { ChartOptions } from "chart.js";

type Props = { state: DashboardState };

export function TabYear({ state: S }: Props) {
  const [growth, setGrowth] = useState(3.5);
  const [invRet, setInvRet] = useState(6);
  const [showMargin, setShowMargin] = useState(true);

  const fromBudget = useMemo(() => monthlyInvestContribution(S), [S.budget]);
  const [invAmt, setInvAmt] = useState(fromBudget);
  const invAmtUserEdited = useRef(false);

  useEffect(() => {
    if (!invAmtUserEdited.current) {
      setInvAmt(fromBudget);
    }
  }, [fromBudget]);

  const invDiffersFromBudget = invAmt !== fromBudget;

  const series = simulate5y(S, { growth, invAdd: invAmt, invRet, useMargin: showMargin });
  const last = series[series.length - 1];

  const chartData = {
    labels: series.map((r) => r.label),
    datasets: [
      { label: "CPF", data: series.map((r) => r.oa + r.sa + r.ma), backgroundColor: "#2f5d3a", stack: "a" },
      { label: "Investments", data: series.map((r) => r.inv), backgroundColor: "#3d6b8e", stack: "a" },
      { label: "Cash", data: series.map((r) => r.cash), backgroundColor: "#c08a2e", stack: "a" },
      { label: "Debt", data: series.map((r) => -r.debt), backgroundColor: "#b5482e", stack: "a" },
      {
        label: "Net worth",
        data: series.map((r) => r.nw),
        type: "line" as const,
        borderColor: "#11201a",
        backgroundColor: "#11201a",
        borderWidth: 2.5,
        pointRadius: 4,
        tension: 0.25,
      },
    ],
  };

  const chartOpts: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (c) =>
            (c.dataset.label ?? "") + ": " + fmt(Math.abs(Number(c.raw))),
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false } },
      y: {
        stacked: true,
        grid: { color: "#e6dfca" },
        ticks: { callback: (v) => "$" + (Number(v) / 1000).toFixed(0) + "k" },
      },
    },
  };

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Monthly invest contribution defaults from <b>Budget &amp; Savings</b> (your investing
        categories). Change it here for what-if projections without changing your budget.
      </div>

      <div className="ctrl">
        <label>
          Salary growth / yr
          <input
            type="number"
            value={growth}
            step={0.5}
            min={0}
            max={15}
            onChange={(e) => setGrowth(+e.target.value)}
          />
          %
        </label>
        <label>
          Monthly invest contribution
          <input
            type="number"
            value={invAmt}
            step={50}
            onChange={(e) => {
              invAmtUserEdited.current = true;
              setInvAmt(+e.target.value);
              console.log("[TabYear] inv contribution override", +e.target.value);
            }}
          />
          <span style={{ fontSize: 11, color: "var(--muted)", display: "block", marginTop: 4 }}>
            From budget: {fmt(fromBudget)}/mo
            {invDiffersFromBudget ? (
              <>
                {" "}
                ·{" "}
                <button
                  type="button"
                  className="btn ghost sm"
                  style={{ padding: "2px 6px", fontSize: 11 }}
                  onClick={() => {
                    invAmtUserEdited.current = false;
                    setInvAmt(fromBudget);
                    console.log("[TabYear] reset inv contribution to budget", fromBudget);
                  }}
                >
                  Reset to budget
                </button>
              </>
            ) : null}
          </span>
        </label>
        <label>
          Investment return / yr
          <input
            type="number"
            value={invRet}
            step={0.5}
            onChange={(e) => setInvRet(+e.target.value)}
          />
          %
        </label>
        <label>
          <input
            type="checkbox"
            checked={showMargin}
            onChange={(e) => setShowMargin(e.target.checked)}
          />
          Count margin loan
        </label>
      </div>

      <div className="grid g4">
        <div className="stat accent">
          <div className="lbl">Projected net worth · 2031</div>
          <div className="val">{fmt(last.nw)}</div>
          <div className="note">CPF + investments + cash − debt</div>
        </div>
        <div className="stat">
          <div className="lbl">CPF total · 2031</div>
          <div className="val">{fmt(last.oa + last.sa + last.ma)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Investment pot · 2031</div>
          <div className="val">{fmt(last.inv)}</div>
          <div className="note">At {fmt(invAmt)}/mo contribution</div>
        </div>
        <div className="stat">
          <div className="lbl">Liquid cash savings · 2031</div>
          <div className="val">{fmt(last.cash)}</div>
        </div>
      </div>

      <h2>Net worth trajectory · 2026 – 2031</h2>
      <div className="card">
        <ChartBox type="bar" data={chartData} options={chartOpts} tall />
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Year-end</th>
              <th>Salary</th>
              <th>CPF total</th>
              <th>Investments</th>
              <th>Cash</th>
              <th>Debt</th>
              <th>Net worth</th>
            </tr>
          </thead>
          <tbody>
            {series.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num">{fmt(r.sal)}</td>
                <td className="num">{fmt(r.oa + r.sa + r.ma)}</td>
                <td className="num">{fmt(r.inv)}</td>
                <td className="num">{fmt(r.cash)}</td>
                <td className="num neg">{r.debt > 0 ? "−" + fmt(r.debt).slice(1) : "$0"}</td>
                <td className="num pos">
                  <b>{fmt(r.nw)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
