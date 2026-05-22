"use client";

import { useState } from "react";
import type { DashboardState, Loan } from "@/lib/types";
import { debtBurnDown, sortedLoans } from "@/lib/finance";
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

export function TabDebt({ state: S, setState }: Props) {
  const [editing, setEditing] = useState(false);
  const { labels, data, totalOut } = debtBurnDown(S);
  const loans = sortedLoans(S);

  const updateLoan = (i: number, key: keyof Loan, val: string | number) => {
    setState((prev) => ({
      ...prev,
      loans: prev.loans.map((l, j) => (j === i ? { ...l, [key]: val } : l)),
    }));
    console.log("[TabDebt] updated loan", i, key, val);
  };

  const addLoan = () => {
    setState((prev) => ({
      ...prev,
      loans: [
        ...prev.loans,
        { name: "New loan", card: "—", monthly: 0, out: 0, end: "2027-01" },
      ],
    }));
    console.log("[TabDebt] added loan");
  };

  const removeLoan = (i: number) => {
    setState((prev) => ({
      ...prev,
      loans: prev.loans.filter((_, j) => j !== i),
    }));
    console.log("[TabDebt] removed loan", i);
  };

  const patchCcDebt = (val: number) => {
    setState((prev) => ({ ...prev, ccDebt: val }));
    console.log("[TabDebt] updated ccDebt", val);
  };

  const finishEditing = () => {
    setEditing(false);
    console.log("[TabDebt] edit mode off");
  };

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Instalment plans feed cashflow, calendar, and debt burn-down charts.
        Click <b>Edit</b> below to change instalment plans and card/BT balance — changes auto-save to Supabase when configured.
        Margin loan is under <b>Edit Inputs</b>.
      </div>

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
          {!editing && (
            <div className="note">Edit with instalment plans below</div>
          )}
        </div>
      </div>

      <div className="section-head">
        <h2>Instalment plans &amp; loans</h2>
        {editing ? (
          <button type="button" className="btn sm" onClick={finishEditing}>
            Done
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setEditing(true);
              console.log("[TabDebt] edit mode on");
            }}
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="card">
          <div className="editrow">
            <span>Card / BT remaining</span>
            <NumInput
              value={S.ccDebt}
              step={0.01}
              onChange={patchCcDebt}
            />
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="editrow head loans">
            <span>Plan</span>
            <span>Card</span>
            <span>Monthly $</span>
            <span>Outstanding $</span>
            <span>Ends YYYY-MM</span>
            <span></span>
          </div>
          {S.loans.map((l, i) => (
            <div className="editrow loans" key={i}>
              <input
                type="text"
                value={l.name}
                onChange={(e) => updateLoan(i, "name", e.target.value)}
              />
              <input
                type="text"
                value={l.card}
                onChange={(e) => updateLoan(i, "card", e.target.value)}
              />
              <NumInput
                value={l.monthly}
                step={0.01}
                onChange={(v) => updateLoan(i, "monthly", v)}
              />
              <NumInput
                value={l.out}
                step={0.01}
                onChange={(v) => updateLoan(i, "out", v)}
              />
              <input
                type="text"
                value={l.end}
                onChange={(e) => updateLoan(i, "end", e.target.value)}
              />
              <button
                type="button"
                className="btn del sm"
                onClick={() => removeLoan(i)}
              >
                del
              </button>
            </div>
          ))}
          <div className="toolbar">
            <button type="button" className="btn ghost sm" onClick={addLoan}>
              + Add loan
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          {S.loans.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
              No instalment plans configured. Click Edit to add one.
            </p>
          ) : (
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
                    <td>
                      <span className={`tag ${l.cls}`}>{l.tag}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

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
