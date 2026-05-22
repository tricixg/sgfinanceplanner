"use client";

import { useState } from "react";
import type { DashboardState } from "@/lib/types";
import { computeBTO } from "@/lib/finance";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";

type Props = { state: DashboardState };

export function TabBTO({ state: S }: Props) {
  const [price, setPrice] = useState(580000);
  const [ltv, setLtv] = useState(75);
  const [rate, setRate] = useState(2.6);
  const [tenure, setTenure] = useState(25);
  const [yrsToKeys, setYrsToKeys] = useState(4);
  const [ehg, setEhg] = useState(0);
  const [tSal, setTSal] = useState(6500);
  const [pSal, setPSal] = useState(4300);
  const [pOA, setPOA] = useState(14575);

  const b = computeBTO({
    price,
    ltv,
    rate,
    tenure,
    yrsToKeys,
    ehg,
    tSal,
    pSal,
    pOA,
    tOA: S.oa,
  });

  const timeline = [
    ["Application", "Jun 2026", "Submit BTO application", "—", "—"],
    ["Booking", "~Late 2026", "Option fee", "$2,000", "Cash"],
    ["Sign AFL", "~3–6 mths after booking", "Downpayment 2.5%", fmt(b.afl), "CPF OA"],
    ["Key collection", "~" + (2026 + Math.round(yrsToKeys)), "Downpayment 22.5%", fmt(b.keyPay), "CPF OA"],
    ["Mortgage", "After keys", "Monthly instalment", fmt(b.mortgage) + "/mo", "CPF OA"],
  ];

  return (
    <section className="panel on">
      <div className="callout tip">
        BTO scenario planner — Deferred Income Assessment + Staggered Downpayment. All inputs editable.
      </div>

      <div className="card">
        <div className="grid g3">
          <label style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Flat price
            <input type="number" value={price} step={10000} style={{ marginTop: 4, display: "block" }}
              onChange={(e) => setPrice(+e.target.value)} />
          </label>
          <label style={{ fontSize: 12.5, color: "var(--muted)" }}>
            HDB loan LTV %
            <input type="number" value={ltv} step={5} style={{ marginTop: 4, display: "block" }}
              onChange={(e) => setLtv(+e.target.value)} />
          </label>
          <label style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Loan interest % p.a.
            <input type="number" value={rate} step={0.1} style={{ marginTop: 4, display: "block" }}
              onChange={(e) => setRate(+e.target.value)} />
          </label>
          <label style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Tenure (years)
            <input type="number" value={tenure} style={{ marginTop: 4, display: "block" }}
              onChange={(e) => setTenure(+e.target.value)} />
          </label>
          <label style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Years to keys
            <input type="number" value={yrsToKeys} step={0.5} style={{ marginTop: 4, display: "block" }}
              onChange={(e) => setYrsToKeys(+e.target.value)} />
          </label>
          <label style={{ fontSize: 12.5, color: "var(--muted)" }}>
            EHG grant
            <input type="number" value={ehg} step={5000} style={{ marginTop: 4, display: "block" }}
              onChange={(e) => setEhg(+e.target.value)} />
          </label>
          <label style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Your salary / mo
            <input type="number" value={tSal} step={100} style={{ marginTop: 4, display: "block" }}
              onChange={(e) => setTSal(+e.target.value)} />
          </label>
          <label style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Partner salary / mo
            <input type="number" value={pSal} step={100} style={{ marginTop: 4, display: "block" }}
              onChange={(e) => setPSal(+e.target.value)} />
          </label>
          <label style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Partner CPF OA now
            <input type="number" value={pOA} step={100} style={{ marginTop: 4, display: "block" }}
              onChange={(e) => setPOA(+e.target.value)} />
          </label>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", marginTop: 8 }}>
          Your OA ({fmt(S.oa)}) is pulled from saved dashboard state.
        </p>
      </div>

      <div className="grid g4">
        <div className="stat">
          <div className="lbl">HDB loan</div>
          <div className="val">{fmt(b.loan)}</div>
        </div>
        <div className="stat accent">
          <div className="lbl">Downpayment at signing (2.5%)</div>
          <div className="val">{fmt(b.afl)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Downpayment at keys (22.5%)</div>
          <div className="val">{fmt(b.keyPay)}</div>
        </div>
        <div className="stat warn">
          <div className="lbl">Monthly mortgage</div>
          <div className="val">{fmt(b.mortgage)}</div>
        </div>
      </div>

      <h2>Payment timeline</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>When</th>
              <th>What&apos;s due</th>
              <th>Amount</th>
              <th>Paid from</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((rw, i) => (
              <tr key={i}>
                <td><b>{rw[0]}</b></td>
                <td>{rw[1]}</td>
                <td style={{ textAlign: "left", fontSize: 12.5 }}>{rw[2]}</td>
                <td className="num">{rw[3]}</td>
                <td>{rw[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <ChartBox
          type="bar"
          data={{
            labels: b.labels,
            datasets: [
              { label: "Your OA", data: b.tSeries, backgroundColor: "#2f5d3a", stack: "a" },
              { label: "Partner OA", data: b.pSeries, backgroundColor: "#3d6b8e", stack: "a" },
              {
                label: "Downpayment due",
                data: b.labels.map(() => b.keyPay),
                type: "line",
                borderColor: "#b5482e",
                borderWidth: 2.5,
                borderDash: [6, 4],
                pointRadius: 0,
                fill: false,
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

      <div className="split">
        <div className="card">
          <div className="section-lbl">Downpayment — CPF check</div>
          <div className="minirow"><span className="k">Your OA at keys</span><span className="v">{fmt(b.to)}</span></div>
          <div className="minirow"><span className="k">Partner OA at keys</span><span className="v">{fmt(b.po)}</span></div>
          <div className="minirow tot"><span className="k">Surplus / shortfall</span>
            <span className={`v ${b.dpSurplus >= 0 ? "pos" : "neg"}`}>
              {b.dpSurplus >= 0 ? fmt(b.dpSurplus) : fmt(-b.dpSurplus)}
            </span>
          </div>
        </div>
        <div className="card">
          <div className="section-lbl">Mortgage — CPF check</div>
          <div className="minirow"><span className="k">Combined OA inflow / mo</span><span className="v pos">{fmt(b.oaInflow)}</span></div>
          <div className="minirow"><span className="k">Mortgage / mo</span><span className="v neg">{fmt(b.mortgage)}</span></div>
          <div className="minirow tot"><span className="k">Surplus / shortfall</span>
            <span className={`v ${b.mortSurplus >= 0 ? "pos" : "neg"}`}>
              {b.mortSurplus >= 0 ? fmt(b.mortSurplus) : fmt(-b.mortSurplus)}
            </span>
          </div>
        </div>
      </div>

      <div className="callout">
        <span className="ico" style={{ color: "var(--gold)" }}>Verdict</span>
        {b.verdict}
      </div>

      <div className="card">
        <div className="minirow"><span className="k">Buyer&apos;s Stamp Duty</span><span className="v">{fmt(b.bsd)}</span></div>
        <div className="minirow tot"><span className="k">Indicative extras (BSD + legal + option)</span><span className="v">{fmt(b.extras)}</span></div>
      </div>
    </section>
  );
}
