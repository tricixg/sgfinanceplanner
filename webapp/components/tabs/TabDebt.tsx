"use client";

import type { DashboardState } from "@/lib/types";
import { debtBurnDown, sortedLoans } from "@/lib/finance";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";

type Props = { state: DashboardState };

export function TabDebt({ state: S }: Props) {
  const { labels, data, totalOut } = debtBurnDown(S);
  const loans = sortedLoans(S);

  return (
    <section className="panel on">
      <div className="grid g3">
        <div className="stat warn">
          <div className="lbl">Total instalment debt outstanding</div>
          <div className="val">{fmt(totalOut)}</div>
        </div>
        <div className="stat warn">
          <div className="lbl">Margin loan</div>
          <div className="val">{fmt(S.margin)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Card / BT remaining</div>
          <div className="val">{fmt(S.ccDebt)}</div>
        </div>
      </div>

      <h2>Instalment plans &amp; loans</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Plan</th>
              <th>Card</th>
              <th>Monthly</th>
              <th>Outstanding</th>
              <th>Ends</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l, i) => (
              <tr key={i}>
                <td>{l.name}</td>
                <td>{l.card}</td>
                <td className="num">{l.monthly ? fmt2(l.monthly) : "—"}</td>
                <td className="num">{fmt2(l.out)}</td>
                <td className="num">{l.endLbl}</td>
                <td><span className={`tag ${l.cls}`}>{l.tag}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Debt burn-down</h2>
      <div className="card">
        <ChartBox
          type="line"
          data={{
            labels,
            datasets: [{
              label: "Outstanding",
              data,
              borderColor: "#b5482e",
              backgroundColor: "rgba(181,72,46,.12)",
              fill: true,
              borderWidth: 2.5,
              tension: 0.25,
              pointRadius: 3,
            }],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false } },
              y: {
                grid: { color: "#e6dfca" },
                ticks: { callback: (v) => "$" + (Number(v) / 1000).toFixed(1) + "k" },
              },
            },
          }}
        />
      </div>
    </section>
  );
}
