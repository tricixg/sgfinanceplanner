"use client";

import { useState } from "react";
import type { DashboardState, Holding, IlpPolicy } from "@/lib/types";
import {
  computedIlpMonthly,
  defaultHolding,
  defaultIlpPolicy,
  lockInLabel,
  lockInStatus,
  netWorthSlices,
  netWorthTotal,
  portfolioValue,
  wealthSummary,
} from "@/lib/finance";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
};

function NumInput({
  value,
  onChange,
  step,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step ?? 1}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  );
}

export function TabWealth({ state: S, setState }: Props) {
  const [editingIlp, setEditingIlp] = useState(false);
  const [editingHoldings, setEditingHoldings] = useState(false);
  const [includeCpf, setIncludeCpf] = useState(false);
  const { port, invTotal, liab, lnw, cpf, cash, ilpVal, ilpLocked } = wealthSummary(S);
  const totalNw = netWorthTotal(S, includeCpf);
  const nwSlices = netWorthSlices(S, includeCpf);
  const ilpPrem = computedIlpMonthly(S);
  const holdings = [...S.holdings].sort((a, b) => b.qty * b.price - a.qty * a.price);

  const updatePolicy = (i: number, patch: Partial<IlpPolicy>) => {
    setState((prev) => ({
      ...prev,
      ilpPolicies: prev.ilpPolicies.map((p, j) =>
        j === i ? { ...p, ...patch } : p
      ),
    }));
    console.log("[TabWealth] updated ILP policy", i, patch);
  };

  const addPolicy = () => {
    setState((prev) => ({
      ...prev,
      ilpPolicies: [...prev.ilpPolicies, defaultIlpPolicy()],
    }));
    console.log("[TabWealth] added ILP policy");
  };

  const removePolicy = (i: number) => {
    setState((prev) => ({
      ...prev,
      ilpPolicies: prev.ilpPolicies.filter((_, j) => j !== i),
    }));
    console.log("[TabWealth] removed ILP policy", i);
  };

  const updateHolding = (i: number, patch: Partial<Holding>) => {
    setState((prev) => {
      const holdings = prev.holdings.map((h, j) => (j === i ? { ...h, ...patch } : h));
      return { ...prev, holdings, moo: portfolioValue(holdings) };
    });
    console.log("[TabWealth] updated holding", i, patch);
  };

  const addHolding = () => {
    setState((prev) => {
      const holdings = [...prev.holdings, defaultHolding()];
      return { ...prev, holdings, moo: portfolioValue(holdings) };
    });
    console.log("[TabWealth] added holding");
  };

  const removeHolding = (i: number) => {
    setState((prev) => {
      const holdings = prev.holdings.filter((_, j) => j !== i);
      return { ...prev, holdings, moo: portfolioValue(holdings) };
    });
    console.log("[TabWealth] removed holding", i);
  };

  const patchMargin = (margin: number) => {
    setState((prev) => ({ ...prev, margin }));
    console.log("[TabWealth] updated margin", margin);
  };

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Edit stock holdings below — portfolio value is calculated from qty × price. Configure ILP
        plans here; premiums flow to <b>Budget &amp; Savings</b> automatically. Cash is the sum of
        savings account balances on <b>ME</b>. Changes auto-save
        to Supabase.
      </div>

      <div className="grid g4">
        <div className="stat accent">
          <div className="lbl">Net worth (excl. CPF)</div>
          <div className="val">{fmt(lnw)}</div>
          <div className="note">After debt · edit CPF on CPF Outlook tab</div>
        </div>
        <div className="stat">
          <div className="lbl">Total investment assets</div>
          <div className="val">{fmt(invTotal)}</div>
          <div className="note">Holdings + ILP account value</div>
        </div>
        <div className="stat">
          <div className="lbl">ILP account value</div>
          <div className="val">{fmt(ilpVal)}</div>
          {ilpLocked > 0 && (
            <div className="note">{fmt(ilpLocked)} in lock-in (still in total)</div>
          )}
        </div>
        <div className="stat warn">
          <div className="lbl">ILP premiums / mo</div>
          <div className="val">{fmt(ilpPrem)}</div>
          <div className="note">Shown on Budget tab (auto)</div>
        </div>
      </div>

      <h2>Net worth</h2>
      <div className="card net-worth-card">
        <label className="ctrl">
          <input
            type="checkbox"
            checked={includeCpf}
            onChange={(e) => {
              setIncludeCpf(e.target.checked);
              console.log("[TabWealth] include CPF", e.target.checked);
            }}
          />
          Include CPF in total net worth
        </label>
        <div className="net-worth-total">
          <div className="lbl">Total net worth</div>
          <div className="val">{fmt(totalNw)}</div>
          <div className="note">
            {includeCpf ? "Includes CPF" : "Excludes CPF"} · debt deducted ({fmt(liab)})
          </div>
        </div>
        {nwSlices.length > 0 ? (
          <ChartBox
            type="pie"
            height={280}
            data={{
              labels: nwSlices.map((s) => s.label),
              datasets: [
                {
                  data: nwSlices.map((s) => s.value),
                  backgroundColor: nwSlices.map((s) => s.color),
                  borderWidth: 2,
                  borderColor: "#faf7ef",
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: true,
                  position: "bottom",
                  labels: { boxWidth: 12, padding: 14 },
                },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const v = Number(ctx.raw);
                      const sum = nwSlices.reduce((s, x) => s + x.value, 0);
                      const pct = sum > 0 ? ((v / sum) * 100).toFixed(1) : "0";
                      return ` ${fmt(v)} (${pct}%)`;
                    },
                  },
                },
              },
            }}
          />
        ) : (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            Add holdings, ILP, cash goals, or CPF to see the breakdown.
          </p>
        )}
      </div>

      <div className="section-head">
        <h2>Investment-linked policies (ILP)</h2>
        {editingIlp ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setEditingIlp(false);
              console.log("[TabWealth] ILP edit off");
            }}
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setEditingIlp(true);
              console.log("[TabWealth] ILP edit on");
            }}
          >
            Edit
          </button>
        )}
      </div>

      <div className="callout tip" style={{ marginBottom: 12 }}>
        Singapore ILPs combine insurance and unit-linked funds. Key fields: premium loading
        (front-end vs back-end), allocation rate (% of premium buying units), lock-in / surrender
        period, and sub-funds. MAS guide:{" "}
        <a
          href="https://www.moneysense.gov.sg/investment-linked-policies-guide-to-fees-and-pricing/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--moss)" }}
        >
          MoneySense — ILP fees
        </a>
        .
      </div>

      {editingIlp ? (
        <div className="card">
          {S.ilpPolicies.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic", marginBottom: 12 }}>
              No ILP policies yet.
            </p>
          ) : (
            S.ilpPolicies.map((p, i) => (
              <div key={i} className="ilp-edit-card">
                <div className="ilp-edit-grid">
                  <label>
                    Insurer
                    <input
                      type="text"
                      value={p.insurer}
                      onChange={(e) => updatePolicy(i, { insurer: e.target.value })}
                    />
                  </label>
                  <label>
                    Plan name
                    <input
                      type="text"
                      value={p.planName}
                      onChange={(e) => updatePolicy(i, { planName: e.target.value })}
                    />
                  </label>
                  <label>
                    Policy no.
                    <input
                      type="text"
                      value={p.policyNo}
                      onChange={(e) => updatePolicy(i, { policyNo: e.target.value })}
                    />
                  </label>
                  <label>
                    Premium type
                    <select
                      value={p.premiumType}
                      onChange={(e) =>
                        updatePolicy(i, {
                          premiumType: e.target.value as IlpPolicy["premiumType"],
                        })
                      }
                    >
                      <option value="regular">Regular premium</option>
                      <option value="single">Single premium</option>
                    </select>
                  </label>
                  <label>
                    Loading structure
                    <select
                      value={p.loadingType}
                      onChange={(e) =>
                        updatePolicy(i, {
                          loadingType: e.target.value as IlpPolicy["loadingType"],
                        })
                      }
                    >
                      <option value="front-end">Front-end loaded</option>
                      <option value="back-end">Back-end loaded</option>
                      <option value="single">Single premium (100% units)</option>
                    </select>
                  </label>
                  <label>
                    Monthly premium
                    <NumInput
                      value={p.monthlyPremium}
                      step={0.01}
                      onChange={(v) => updatePolicy(i, { monthlyPremium: v })}
                    />
                  </label>
                  <label>
                    Account value
                    <NumInput
                      value={p.accountValue}
                      step={0.01}
                      onChange={(v) => updatePolicy(i, { accountValue: v })}
                    />
                  </label>
                  <label>
                    Allocation rate (% to units)
                    <NumInput
                      value={p.premiumAllocationPct}
                      step={1}
                      onChange={(v) => updatePolicy(i, { premiumAllocationPct: v })}
                    />
                  </label>
                  <label>
                    Policy start (YYYY-MM)
                    <input
                      type="month"
                      value={p.policyStartYm}
                      onChange={(e) => updatePolicy(i, { policyStartYm: e.target.value })}
                    />
                  </label>
                  <label>
                    Lock-in / min. period ends
                    <input
                      type="month"
                      value={p.lockInEndYm}
                      onChange={(e) => updatePolicy(i, { lockInEndYm: e.target.value })}
                    />
                  </label>
                  <label>
                    Surrender charge ends
                    <input
                      type="month"
                      value={p.surrenderChargeEndYm}
                      onChange={(e) =>
                        updatePolicy(i, { surrenderChargeEndYm: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Insurance cover (sum assured)
                    <NumInput
                      value={p.insuranceCover}
                      step={1000}
                      onChange={(v) => updatePolicy(i, { insuranceCover: v })}
                    />
                  </label>
                  <label>
                    Free fund switches / yr
                    <NumInput
                      value={p.freeFundSwitchesPerYear}
                      step={1}
                      onChange={(v) => updatePolicy(i, { freeFundSwitchesPerYear: v })}
                    />
                  </label>
                  <label className="full">
                    Sub-funds held
                    <input
                      type="text"
                      value={p.funds}
                      placeholder="e.g. Equity, Balanced, Bond"
                      onChange={(e) => updatePolicy(i, { funds: e.target.value })}
                    />
                  </label>
                  <label className="full">
                    Notes
                    <input
                      type="text"
                      value={p.notes}
                      onChange={(e) => updatePolicy(i, { notes: e.target.value })}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="btn del sm"
                  onClick={() => removePolicy(i)}
                >
                  Remove policy
                </button>
              </div>
            ))
          )}
          <div className="toolbar">
            <button type="button" className="btn ghost sm" onClick={addPolicy}>
              + Add ILP policy
            </button>
          </div>
        </div>
      ) : (
        <div className="card table-scroll">
          {S.ilpPolicies.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
              No ILP policies. Click Edit to add your Manulife or other ILP details.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Insurer</th>
                  <th>Plan</th>
                  <th>Premium / mo</th>
                  <th>Account value</th>
                  <th>Loading</th>
                  <th>Allocation</th>
                  <th>Lock-in</th>
                  <th>Funds</th>
                </tr>
              </thead>
              <tbody>
                {S.ilpPolicies.map((p, i) => {
                  const lock = lockInStatus(p);
                  return (
                    <tr key={i}>
                      <td>{p.insurer || "—"}</td>
                      <td>{p.planName || "—"}</td>
                      <td className="num">{fmt2(p.monthlyPremium)}</td>
                      <td className="num">{fmt2(p.accountValue)}</td>
                      <td>{p.loadingType}</td>
                      <td className="num">{p.premiumAllocationPct}%</td>
                      <td>
                        <span
                          className={`tag ${lock === "locked" ? "t-soon" : lock === "free" ? "t-live" : "t-end"}`}
                        >
                          {lockInLabel(p)}
                        </span>
                      </td>
                      <td>{p.funds || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="section-head">
        <h2>Investment holdings</h2>
        {editingHoldings ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setEditingHoldings(false);
              console.log("[TabWealth] holdings edit off");
            }}
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setEditingHoldings(true);
              console.log("[TabWealth] holdings edit on");
            }}
          >
            Edit
          </button>
        )}
      </div>

      <div className="card">
        {editingHoldings ? (
          <>
            <div className="editrow" style={{ borderBottom: "1.5px solid var(--ink)", paddingBottom: 10 }}>
              <span>Margin loan (outstanding)</span>
              <NumInput value={S.margin} step={0.01} onChange={patchMargin} />
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="editrow head holdings">
              <span>Stock</span>
              <span>Ticker</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Sector</span>
              <span></span>
            </div>
            {S.holdings.length === 0 ? (
              <p style={{ color: "var(--muted)", fontStyle: "italic", margin: "12px 0" }}>
                No holdings yet. Add a line below.
              </p>
            ) : (
              S.holdings.map((h, i) => (
                <div className="editrow holdings" key={i}>
                  <input
                    type="text"
                    value={h.name}
                    onChange={(e) => updateHolding(i, { name: e.target.value })}
                  />
                  <input
                    type="text"
                    value={h.ticker}
                    onChange={(e) => updateHolding(i, { ticker: e.target.value })}
                  />
                  <NumInput
                    value={h.qty}
                    step={1}
                    onChange={(v) => updateHolding(i, { qty: v })}
                  />
                  <NumInput
                    value={h.price}
                    step={0.001}
                    onChange={(v) => updateHolding(i, { price: v })}
                  />
                  <input
                    type="text"
                    value={h.sector}
                    onChange={(e) => updateHolding(i, { sector: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn del sm"
                    onClick={() => removeHolding(i)}
                  >
                    del
                  </button>
                </div>
              ))
            )}
            <div className="toolbar">
              <button type="button" className="btn ghost sm" onClick={addHolding}>
                + Add holding
              </button>
            </div>
          </>
        ) : holdings.length === 0 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            No stock holdings. Click <b>Edit</b> to add lines or import JSON.
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
              {holdings.map((h, i) => {
                const v = h.qty * h.price;
                const w = port > 0 ? (v / port) * 100 : 0;
                return (
                  <tr key={`${h.ticker}-${i}`}>
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
            <span className="k">Portfolio value (calculated)</span>
            <span className="v">{fmt2(port)}</span>
            <span className="note" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
              Sum of qty × price across holdings
            </span>
          </div>
          <div className="minirow" style={{ border: "none" }}>
            <span className="k">Margin loan</span>
            <span className="v neg">−{fmt2(S.margin).slice(1)}</span>
            {!editingHoldings && (
              <span className="note" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
                Click Edit to change
              </span>
            )}
          </div>
          <div className="minirow" style={{ border: "none" }}>
            <span className="k">Cash (savings accounts)</span>
            <span className="v">{fmt2(cash)}</span>
            <span className="note" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
              Sum of balances on ME tab
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
