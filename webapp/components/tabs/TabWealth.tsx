"use client";

import type { DashboardState } from "@/lib/types";
import { portfolioValue, wealthSummary } from "@/lib/finance";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";

type Props = { state: DashboardState };

export function TabWealth({ state: S }: Props) {
  const { port, invTotal, liab, lnw, cpf } = wealthSummary(S);
  const holdings = [...S.holdings].sort((a, b) => b.qty * b.price - a.qty * a.price);

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Portfolio and CPF balances are edited on <b>Edit Inputs</b>. Monthly budget and savings
        goals are on <b>Budget &amp; Savings</b>.
      </div>

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
        {holdings.length === 0 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            No holdings in state. Import JSON or add via saved data.
          </p>
        ) : (
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
        )}
        <div className="grid g3" style={{ marginTop: 14 }}>
          <div className="minirow" style={{ border: "none" }}>
            <span className="k">Portfolio value (holdings)</span>
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
    </section>
  );
}
