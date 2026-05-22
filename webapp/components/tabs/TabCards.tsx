"use client";

import type { CreditCard, DashboardState } from "@/lib/types";

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
  };

  const removeCard = (i: number) => {
    setState((prev) => ({
      ...prev,
      creditCards: prev.creditCards.filter((_, j) => j !== i),
    }));
  };

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Statement amounts and due dates appear on the <b>This Month</b> calendar.
        Balance transfers and instalment plans stay under Debts &amp; Loans.
      </div>

      <h2>Credit cards</h2>
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
                updateCard(i, "statementDay", Math.min(31, Math.max(1, Math.round(v))))
              }
            />
            <NumInput
              value={c.paymentDueDay}
              min={1}
              max={31}
              onChange={(v) =>
                updateCard(i, "paymentDueDay", Math.min(31, Math.max(1, Math.round(v))))
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
    </section>
  );
}
