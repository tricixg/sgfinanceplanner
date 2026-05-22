"use client";

import { useState } from "react";
import type { DashboardState } from "@/lib/types";
import {
  budgetProjection,
  budgetVerdict,
  portfolioValue,
  stableTakeHome,
  wealthSummary,
} from "@/lib/finance";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
};

export function TabWealth({ state: S, setState }: Props) {
  const [budRet, setBudRet] = useState(6);
  const [budYrs, setBudYrs] = useState(10);

  const { port, invTotal, liab, lnw, cpf } = wealthSummary(S);
  const income = stableTakeHome(S);
  const { alloc, left, invPct, savePct } = budgetVerdict(S);
  const monthlyInv = S.budget.filter((b) => b.type === "invest").reduce((s, b) => s + b.amt, 0);
  const monthlySave = S.budget.filter((b) => b.type === "save").reduce((s, b) => s + b.amt, 0);
  const proj = budgetProjection(S, monthlyInv, monthlySave, budRet, budYrs);

  const palette: Record<string, string> = {
    fixed: "#a89a76",
    spend: "#c08a2e",
    save: "#3d6b8e",
    invest: "#2f5d3a",
  };

  let verdict = "";
  if (Math.abs(left) > 20) {
    verdict =
      left < 0
        ? `Over-allocated by ${fmt2(-left)}. Trim a category.`
        : `${fmt2(left)} unallocated — assign to saving or investing.`;
  } else {
    verdict = "Balanced plan. ";
  }
  verdict += ` Directing ${invPct.toFixed(0)}% to investing and ${savePct.toFixed(0)}% to savings.`;

  const holdings = [...S.holdings].sort((a, b) => b.qty * b.price - a.qty * a.price);

  return (
    <section className="panel on">
      <div className="grid g4">
        <div className="stat accent">
          <div className="lbl">Liquid net worth — excl. CPF</div>
          <div className="val">{fmt(lnw)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Total investment assets</div>
          <div className="val">{fmt(invTotal)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Cash savings</div>
          <div className="val">{fmt(S.cash)}</div>
        </div>
        <div className="stat warn">
          <div className="lbl">Liabilities</div>
          <div className="val">{fmt(liab)}</div>
        </div>
      </div>

      <h2>Net worth — with vs without CPF</h2>
      <div className="card">
        <ChartBox
          type="bar"
          data={{
            labels: ["Liquid (spendable now)", "CPF (locked)"],
            datasets: [
              { label: "Investments", data: [invTotal, 0], backgroundColor: "#3d6b8e", stack: "a" },
              { label: "Cash", data: [S.cash, 0], backgroundColor: "#c08a2e", stack: "a" },
              { label: "Liabilities", data: [-liab, 0], backgroundColor: "#b5482e", stack: "a" },
              { label: "CPF", data: [0, cpf], backgroundColor: "#2f5d3a", stack: "a" },
            ],
          }}
          options={{
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: {
                stacked: true,
                grid: { color: "#e6dfca" },
                ticks: { callback: (v) => "$" + (Number(v) / 1000).toFixed(0) + "k" },
              },
              y: { stacked: true, grid: { display: false } },
            },
          }}
        />
      </div>

      <h2>Investment holdings</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Stock</th>
              <th>Ticker</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Value</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const v = h.qty * h.price;
              const w = port > 0 ? (v / port) * 100 : 0;
              return (
                <tr key={h.ticker}>
                  <td>{h.name}</td>
                  <td className="num">{h.ticker}</td>
                  <td className="num">{h.qty.toLocaleString()}</td>
                  <td className="num">{h.price.toFixed(3)}</td>
                  <td className="num">{fmt2(v)}</td>
                  <td className={`num ${w > 50 ? "neg" : ""}`}>{w.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="grid g3" style={{ marginTop: 14 }}>
          <div className="minirow" style={{ border: "none" }}>
            <span className="k">Portfolio value</span>
            <span className="v">{fmt2(port)}</span>
          </div>
          <div className="minirow" style={{ border: "none" }}>
            <span className="k">Margin loan</span>
            <span className="v neg">−{fmt2(S.margin).slice(1)}</span>
          </div>
          <div className="minirow" style={{ border: "none" }}>
            <span className="k">ILP value</span>
            <span className="v">{fmt2(S.ilp)}</span>
          </div>
        </div>
      </div>

      <h2>Monthly budget planner</h2>
      <div className="callout tip">
        Stable monthly take-home from August: <b>{fmt(income)}</b>. Adjust sliders until balanced.
      </div>

      <div className="split">
        <div className="card">
          {S.budget.map((b, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                <span>{b.cat}</span>
                <span className="num">{fmt2(b.amt)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.round(income)}
                step={10}
                value={b.amt}
                onChange={(e) => {
                  const amt = +e.target.value;
                  setState((prev) => ({
                    ...prev,
                    budget: prev.budget.map((x, j) => (j === i ? { ...x, amt } : x)),
                  }));
                }}
                style={{ width: "100%", cursor: "pointer" }}
              />
            </div>
          ))}
          <div className="minirow tot">
            <span className="k">Allocated</span>
            <span className="v">{fmt2(alloc)}</span>
          </div>
          <div className="minirow" style={{ border: "none" }}>
            <span className="k">Unallocated</span>
            <span className={`v ${left < -1 ? "neg" : ""}`}>{fmt2(Math.abs(left))}</span>
          </div>
        </div>
        <div className="card">
          <ChartBox
            type="doughnut"
            data={{
              labels: S.budget.map((b) => b.cat),
              datasets: [{
                data: S.budget.map((b) => b.amt),
                backgroundColor: S.budget.map((b) => palette[b.type] ?? "#999"),
                borderColor: "#fffdf6",
                borderWidth: 2,
              }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: "right", labels: { boxWidth: 9, font: { size: 9.5 } } } },
            }}
            height={220}
          />
          <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>{verdict}</div>
        </div>
      </div>

      <div className="card">
        <div className="ctrl">
          <label>Return % <input type="number" value={budRet} step={0.5} onChange={(e) => setBudRet(+e.target.value)} /></label>
          <label>Years <input type="number" value={budYrs} min={3} max={30} onChange={(e) => setBudYrs(+e.target.value)} /></label>
        </div>
        <ChartBox
          type="bar"
          data={{
            labels: proj.labels,
            datasets: [
              { label: "Invested", data: proj.invSeries, backgroundColor: "#3d6b8e", stack: "a" },
              { label: "Cash", data: proj.cashSeries, backgroundColor: "#c08a2e", stack: "a" },
              {
                label: "LNW",
                data: proj.nwSeries,
                type: "line",
                borderColor: "#11201a",
                borderWidth: 2.5,
                pointRadius: 3,
                tension: 0.25,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { stacked: true, grid: { display: false } },
              y: {
                stacked: true,
                grid: { color: "#e6dfca" },
                ticks: { callback: (v) => "$" + (Number(v) / 1000).toFixed(0) + "k" },
              },
            },
          }}
        />
      </div>

      <div className="grid g3">
        <div className="stat">
          <div className="lbl">Invested pot — end</div>
          <div className="val">{fmt(proj.invPot)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Cash savings — end</div>
          <div className="val">{fmt(proj.cashPot)}</div>
        </div>
        <div className="stat accent">
          <div className="lbl">Liquid net worth — end</div>
          <div className="val">{fmt(proj.invPot + proj.cashPot)}</div>
        </div>
      </div>
    </section>
  );
}
