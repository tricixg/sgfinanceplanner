"use client";

import { useMemo, useState } from "react";
import type { DashboardState } from "@/lib/types";
import {
  BTO_SCHEME_DEFS,
  calcEhgFamilyGrant,
  buildBTOTimeline,
  computeBTO,
  currentYm,
  defaultBTOSchemes,
  enabledSchemeRows,
  schemeComputedAmount,
  type BTOSchemeId,
  type BTOSchemeSelection,
} from "@/lib/finance";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";

type Props = { state: DashboardState };

export function TabBTO({ state: S }: Props) {
  const [price, setPrice] = useState(580000);
  const [ltv, setLtv] = useState(75);
  const [rate, setRate] = useState(2.6);
  const [tenure, setTenure] = useState(25);
  const [yrsToKeys, setYrsToKeys] = useState(4);
  const [applicationYm, setApplicationYm] = useState(currentYm);
  const [tSal, setTSal] = useState(S.monthlySal || 6500);
  const [pSal, setPSal] = useState(4300);
  const [pOA, setPOA] = useState(14575);
  const [schemes, setSchemes] = useState<BTOSchemeSelection>(defaultBTOSchemes);
  const [editingSchemes, setEditingSchemes] = useState(false);
  const [editingCalc, setEditingCalc] = useState(false);

  const b = useMemo(
    () =>
      computeBTO({
        price,
        ltv,
        rate,
        tenure,
        yrsToKeys,
        schemes,
        tSal,
        pSal,
        pOA,
        tOA: S.oa,
      }),
    [price, ltv, rate, tenure, yrsToKeys, schemes, tSal, pSal, pOA, S.oa]
  );

  const activeSchemes = useMemo(
    () => enabledSchemeRows(schemes, { tSal, pSal }),
    [schemes, tSal, pSal]
  );

  const householdIncome = tSal + pSal;

  const toggleScheme = (id: BTOSchemeId, enabled: boolean) => {
    setSchemes((prev) => ({
      ...prev,
      [id]: { ...prev[id], enabled },
    }));
    console.log("[TabBTO] scheme toggled", id, enabled);
  };

  const setSchemeOverride = (id: BTOSchemeId, amount: number | null) => {
    setSchemes((prev) => ({
      ...prev,
      [id]: { ...prev[id], amountOverride: amount },
    }));
    console.log("[TabBTO] scheme amount override", id, amount);
  };

  const resetSchemeAmount = (id: BTOSchemeId) => {
    setSchemes((prev) => ({
      ...prev,
      [id]: { ...prev[id], amountOverride: null },
    }));
    console.log("[TabBTO] scheme amount reset", id);
  };

  const timelineDates = useMemo(
    () => buildBTOTimeline(applicationYm, yrsToKeys),
    [applicationYm, yrsToKeys]
  );

  const timeline = useMemo(
    () => [
      ["Application", timelineDates.application, "Submit BTO application", "—", "—"],
      ["Booking", timelineDates.booking, "Option fee", "$2,000", "Cash"],
      ["Sign AFL", "~3–6 mths after booking", "Downpayment 2.5%", fmt(b.afl), "CPF OA"],
      ["Key collection", timelineDates.keys, "Downpayment 22.5%", fmt(b.keyPay), "CPF OA"],
      ["Mortgage", "After keys", "Monthly instalment", fmt(b.mortgage) + "/mo", "CPF OA"],
    ],
    [timelineDates, b.afl, b.keyPay, b.mortgage]
  );

  return (
    <section className="panel on">
      <div className="callout tip">
        Tick housing schemes you expect from your HFE letter — grants reduce the purchase
        price, loan, and downpayment. EHG is estimated from combined household income (
        {fmt(householdIncome)}/mo). Resale-only schemes are marked; include only if
        applicable. Staggered downpayment (2.5% + 22.5%) and CPF OA growth use your
        salaries below.
      </div>

      <div className="section-head">
        <h2>Housing schemes</h2>
        {editingSchemes ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setEditingSchemes(false);
              console.log("[TabBTO] schemes edit off");
            }}
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setEditingSchemes(true);
              console.log("[TabBTO] schemes edit on");
            }}
          >
            Edit amounts
          </button>
        )}
      </div>

      <div className="card bto-schemes-card">
        {BTO_SCHEME_DEFS.map((def) => {
          const sel = schemes[def.id];
          const computed = schemeComputedAmount(def.id, { tSal, pSal });
          const amount = sel.enabled
            ? sel.amountOverride != null
              ? sel.amountOverride
              : computed
            : 0;
          const isResaleOnly = def.appliesTo === "resale";
          return (
            <div
              key={def.id}
              className={`bto-scheme-row ${sel.enabled ? "on" : ""}`}
            >
              <label className="bto-scheme-check">
                <input
                  type="checkbox"
                  checked={sel.enabled}
                  onChange={(e) => toggleScheme(def.id, e.target.checked)}
                />
                <span className="bto-scheme-title">{def.name}</span>
                {isResaleOnly ? (
                  <span className="tag t-soon">Resale</span>
                ) : (
                  <span className="tag t-live">BTO + resale</span>
                )}
              </label>
              <p className="bto-scheme-summary">{def.summary}</p>
              <p className="bto-scheme-eligibility">
                <b>Eligibility:</b> {def.eligibility}
              </p>
              <a
                href={def.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bto-scheme-link"
              >
                HDB / CPF reference
              </a>
              {sel.enabled && (
                <div className="bto-scheme-amt">
                  {editingSchemes ? (
                    <label>
                      Grant amount
                      <input
                        type="number"
                        value={amount}
                        step={500}
                        onChange={(e) =>
                          setSchemeOverride(def.id, +e.target.value)
                        }
                      />
                      {def.id === "ehg" && (
                        <span className="note" style={{ display: "block", marginTop: 4 }}>
                          Auto from income: {fmt(computed)} (≤$9k/mo ceiling)
                        </span>
                      )}
                      {sel.amountOverride != null && sel.amountOverride !== computed && (
                        <button
                          type="button"
                          className="btn ghost sm"
                          style={{ marginTop: 6 }}
                          onClick={() => resetSchemeAmount(def.id)}
                        >
                          Reset to calculated
                        </button>
                      )}
                    </label>
                  ) : (
                    <>
                      <span className="k">Grant in scenario</span>
                      <span className="v">{fmt(amount)}</span>
                      {def.id === "ehg" && (
                        <span className="note">
                          From household income {fmt(householdIncome)}/mo → EHG{" "}
                          {fmt(calcEhgFamilyGrant(householdIncome))}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="minirow tot">
          <span className="k">Total grants applied</span>
          <span className="v">{fmt(b.totalGrants)}</span>
        </div>
        <div className="minirow" style={{ border: "none" }}>
          <span className="k">Net purchase price (after grants)</span>
          <span className="v">{fmt(b.netPrice)}</span>
          <span className="note" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
            List price {fmt(b.price)} − grants {fmt(b.totalGrants)}
          </span>
        </div>
      </div>

      <div className="section-head">
        <h2>Flat &amp; financing</h2>
        {editingCalc ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setEditingCalc(false);
              console.log("[TabBTO] calc edit off");
            }}
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setEditingCalc(true);
              console.log("[TabBTO] calc edit on");
            }}
          >
            Edit
          </button>
        )}
      </div>

      {editingCalc ? (
        <div className="card">
          <div className="grid g3">
            <label className="bto-field">
              Flat price (list)
              <input
                type="number"
                value={price}
                step={10000}
                onChange={(e) => setPrice(+e.target.value)}
              />
            </label>
            <label className="bto-field">
              HDB loan LTV %
              <input
                type="number"
                value={ltv}
                step={5}
                onChange={(e) => setLtv(+e.target.value)}
              />
            </label>
            <label className="bto-field">
              Loan interest % p.a.
              <input
                type="number"
                value={rate}
                step={0.1}
                onChange={(e) => setRate(+e.target.value)}
              />
            </label>
            <label className="bto-field">
              Tenure (years)
              <input
                type="number"
                value={tenure}
                onChange={(e) => setTenure(+e.target.value)}
              />
            </label>
            <label className="bto-field">
              BTO application month
              <input
                type="month"
                value={applicationYm}
                onChange={(e) => {
                  setApplicationYm(e.target.value);
                  console.log("[TabBTO] application month", e.target.value);
                }}
              />
            </label>
            <label className="bto-field">
              Years to keys
              <input
                type="number"
                value={yrsToKeys}
                step={0.5}
                onChange={(e) => setYrsToKeys(+e.target.value)}
              />
            </label>
            <label className="bto-field">
              Your salary / mo
              <input
                type="number"
                value={tSal}
                step={100}
                onChange={(e) => setTSal(+e.target.value)}
              />
            </label>
            <label className="bto-field">
              Partner salary / mo
              <input
                type="number"
                value={pSal}
                step={100}
                onChange={(e) => setPSal(+e.target.value)}
              />
            </label>
            <label className="bto-field">
              Partner CPF OA now
              <input
                type="number"
                value={pOA}
                step={100}
                onChange={(e) => setPOA(+e.target.value)}
              />
            </label>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", marginTop: 8 }}>
            Your OA ({fmt(S.oa)}) from dashboard · combined income {fmt(householdIncome)}
            /mo drives EHG when ticked
          </p>
        </div>
      ) : (
        <div className="grid g4">
          <div className="stat">
            <div className="lbl">Application</div>
            <div className="val">{timelineDates.application}</div>
          </div>
          <div className="stat">
            <div className="lbl">Est. key collection</div>
            <div className="val">{timelineDates.keys}</div>
          </div>
          <div className="stat">
            <div className="lbl">List price</div>
            <div className="val">{fmt(b.price)}</div>
          </div>
          <div className="stat">
            <div className="lbl">After grants</div>
            <div className="val">{fmt(b.netPrice)}</div>
            <div className="note">{activeSchemes.length} scheme(s) on</div>
          </div>
        </div>
      )}

      {!editingCalc && (
        <div className="grid g2" style={{ marginTop: 8 }}>
          <div className="stat">
            <div className="lbl">HDB loan</div>
            <div className="val">{fmt(b.loan)}</div>
          </div>
          <div className="stat warn">
            <div className="lbl">Monthly mortgage</div>
            <div className="val">{fmt(b.mortgage)}</div>
          </div>
        </div>
      )}

      <div className="grid g3" style={{ marginTop: 12 }}>
        <div className="stat accent">
          <div className="lbl">Downpayment at signing (2.5%)</div>
          <div className="val">{fmt(b.afl)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Downpayment at keys (22.5%)</div>
          <div className="val">{fmt(b.keyPay)}</div>
        </div>
        <div className="stat">
          <div className="lbl">BSD (on net price)</div>
          <div className="val">{fmt2(b.bsd)}</div>
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
                <td>
                  <b>{rw[0]}</b>
                </td>
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
          <div className="minirow">
            <span className="k">Your OA at keys</span>
            <span className="v">{fmt(b.to)}</span>
          </div>
          <div className="minirow">
            <span className="k">Partner OA at keys</span>
            <span className="v">{fmt(b.po)}</span>
          </div>
          <div className="minirow tot">
            <span className="k">Surplus / shortfall vs 22.5%</span>
            <span className={`v ${b.dpSurplus >= 0 ? "pos" : "neg"}`}>
              {b.dpSurplus >= 0 ? fmt(b.dpSurplus) : fmt(-b.dpSurplus)}
            </span>
          </div>
        </div>
        <div className="card">
          <div className="section-lbl">Mortgage — CPF check</div>
          <div className="minirow">
            <span className="k">Combined OA inflow / mo</span>
            <span className="v pos">{fmt(b.oaInflow)}</span>
          </div>
          <div className="minirow">
            <span className="k">Mortgage / mo</span>
            <span className="v neg">{fmt(b.mortgage)}</span>
          </div>
          <div className="minirow tot">
            <span className="k">Surplus / shortfall</span>
            <span className={`v ${b.mortSurplus >= 0 ? "pos" : "neg"}`}>
              {b.mortSurplus >= 0 ? fmt(b.mortSurplus) : fmt(-b.mortSurplus)}
            </span>
          </div>
        </div>
      </div>

      <div className="callout">
        <span className="ico" style={{ color: "var(--gold)" }}>
          Verdict
        </span>
        {b.verdict}
      </div>

      <div className="card">
        <div className="minirow">
          <span className="k">Buyer&apos;s Stamp Duty</span>
          <span className="v">{fmt(b.bsd)}</span>
        </div>
        <div className="minirow tot">
          <span className="k">Indicative extras (BSD + legal + option)</span>
          <span className="v">{fmt(b.extras)}</span>
        </div>
      </div>
    </section>
  );
}
