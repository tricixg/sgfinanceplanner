"use client";

import { useState } from "react";
import type { CreditCard, DashboardState } from "@/lib/types";
import { totalStatementAmount } from "@/lib/finance/calendar";
import { fmt, fmt2 } from "@/lib/finance/helpers";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
};

function NumInput({
  value,
  onChange,
  step,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step ?? 1}
      min={min}
      max={max}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  );
}

export function TabCards({ state: S, setState }: Props) {
  const [editing, setEditing] = useState(false);
  const stmtTotal = totalStatementAmount(S);

  const updateCard = (
    i: number,
    key: keyof CreditCard,
    val: string | number
  ) => {
    setState((prev) => ({
      ...prev,
      creditCards: prev.creditCards.map((c, j) =>
        j === i ? { ...c, [key]: val } : c
      ),
    }));
    console.log("[TabCards] updated card", i, key, val);
  };

  const addCard = () => {
    setState((prev) => ({
      ...prev,
      creditCards: [
        ...prev.creditCards,
        {
          name: "New card",
          statementDay: 1,
          paymentDueDay: 21,
          statementAmount: 0,
        },
      ],
    }));
    console.log("[TabCards] added card");
  };

  const removeCard = (i: number) => {
    setState((prev) => ({
      ...prev,
      creditCards: prev.creditCards.filter((_, j) => j !== i),
    }));
    console.log("[TabCards] removed card", i);
  };

  const finishEditing = () => {
    setEditing(false);
    console.log("[TabCards] edit mode off");
  };

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Statement amounts and due dates appear on the <b>This Month</b> calendar.
        Balance transfers and instalment plans stay under Debts &amp; Loans.
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="stat accent">
          <div className="lbl">Statement balances (all cards)</div>
          <div className="val">{fmt(stmtTotal)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Cards tracked</div>
          <div className="val">{S.creditCards.length}</div>
        </div>
        <div className="stat">
          <div className="lbl">Salary credit day</div>
          <div className="val">Day {S.salaryCreditDay}</div>
          <div className="note">Edit on Edit Inputs tab</div>
        </div>
      </div>

      <div className="section-head">
        <h2>Credit cards</h2>
        {editing ? (
          <button
            type="button"
            className="btn sm"
            onClick={finishEditing}
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setEditing(true);
              console.log("[TabCards] edit mode on");
            }}
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="card">
          <div className="editrow head">
            <span>Card name</span>
            <span>Statement day</span>
            <span>Payment due day</span>
            <span>Statement amount</span>
            <span></span>
          </div>
          {S.creditCards.map((c, i) => (
            <div className="editrow" key={i}>
              <input
                type="text"
                value={c.name}
                onChange={(e) => updateCard(i, "name", e.target.value)}
              />
              <NumInput
                value={c.statementDay}
                min={1}
                max={31}
                onChange={(v) =>
                  updateCard(
                    i,
                    "statementDay",
                    Math.min(31, Math.max(1, Math.round(v)))
                  )
                }
              />
              <NumInput
                value={c.paymentDueDay}
                min={1}
                max={31}
                onChange={(v) =>
                  updateCard(
                    i,
                    "paymentDueDay",
                    Math.min(31, Math.max(1, Math.round(v)))
                  )
                }
              />
              <NumInput
                value={c.statementAmount}
                step={0.01}
                onChange={(v) => updateCard(i, "statementAmount", v)}
              />
              <button
                type="button"
                className="btn del sm"
                onClick={() => removeCard(i)}
              >
                del
              </button>
            </div>
          ))}
          <div className="toolbar">
            <button type="button" className="btn ghost sm" onClick={addCard}>
              + Add card
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          {S.creditCards.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
              No credit cards configured. Click Edit to add one.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Statement day</th>
                  <th>Payment due day</th>
                  <th>Statement amount</th>
                </tr>
              </thead>
              <tbody>
                {S.creditCards.map((c, i) => (
                  <tr key={i}>
                    <td>{c.name}</td>
                    <td className="num">Day {c.statementDay}</td>
                    <td className="num">Day {c.paymentDueDay}</td>
                    <td className="num">
                      {c.statementAmount > 0 ? fmt2(c.statementAmount) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
