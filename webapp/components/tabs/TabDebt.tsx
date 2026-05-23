"use client";

import { useState } from "react";
import type { DashboardState, Loan } from "@/lib/types";
import {
  activeLoanOutstanding,
  creditCardLabel,
  debtBurnDown,
  ensureCreditCardIds,
  partitionLoans,
} from "@/lib/finance";
import type { EnrichedLoan } from "@/lib/finance/debt";
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
  const { labels, data } = debtBurnDown(S);
  const totalOut = activeLoanOutstanding(S);
  const { active: activeLoans, archived: archivedLoans } = partitionLoans(S);

  const cardsWithIds = ensureCreditCardIds(S.creditCards);

  const updateLoan = (i: number, key: keyof Loan, val: string | number) => {
    setState((prev) => ({
      ...prev,
      loans: prev.loans.map((l, j) => (j === i ? { ...l, [key]: val } : l)),
    }));
    console.log("[TabDebt] updated loan", i, key, val);
  };

  const setLoanCard = (i: number, cardId: string) => {
    const label = creditCardLabel(cardsWithIds, cardId) || "—";
    setState((prev) => {
      const loans = prev.loans.map((l, j) =>
        j === i ? { ...l, cardId: cardId || undefined, card: label } : l
      );
      console.log("[TabDebt] linked loan to card", { index: i, cardId, label });
      return { ...prev, loans };
    });
  };

  const addLoan = () => {
    const defaultCardId = cardsWithIds[0]?.id;
    const defaultLabel = creditCardLabel(cardsWithIds, defaultCardId) || "—";
    setState((prev) => {
      const creditCards = ensureCreditCardIds(prev.creditCards);
      return {
        ...prev,
        creditCards,
        loans: [
          ...prev.loans,
          {
            name: "New instalment plan",
            card: defaultLabel,
            cardId: defaultCardId,
            monthly: 0,
            out: 0,
            end: "2027-01",
          },
        ],
      };
    });
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

  const loanTableHead = (
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
  );

  const loanRow = (l: EnrichedLoan) => (
    <tr key={l.index}>
      <td>{l.name}</td>
      <td>{creditCardLabel(cardsWithIds, l.cardId) || l.card}</td>
      <td className="num">{l.monthly ? fmt2(l.monthly) : "—"}</td>
      <td className="num">{fmt2(l.out)}</td>
      <td className="num">{l.endLbl}</td>
      <td>
        <span className={`tag ${l.cls}`}>{l.tag}</span>
      </td>
    </tr>
  );

  const editLoanRows = (list: EnrichedLoan[]) =>
    list.map((l) => (
      <div className="editrow loans" key={l.index}>
        <input
          type="text"
          value={l.name}
          onChange={(e) => updateLoan(l.index, "name", e.target.value)}
        />
        <select
          value={l.cardId ?? ""}
          onChange={(e) => setLoanCard(l.index, e.target.value)}
        >
          <option value="">— Select card —</option>
          {cardsWithIds.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <NumInput
          value={l.monthly}
          step={0.01}
          onChange={(v) => updateLoan(l.index, "monthly", v)}
        />
        <NumInput
          value={l.out}
          step={0.01}
          onChange={(v) => updateLoan(l.index, "out", v)}
        />
        <input
          type="text"
          value={l.end}
          onChange={(e) => updateLoan(l.index, "end", e.target.value)}
        />
        <button
          type="button"
          className="btn del sm"
          onClick={() => removeLoan(l.index)}
        >
          del
        </button>
      </div>
    ));

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Instalment plans feed cashflow, calendar, and debt burn-down charts. Link each
        plan to a <b>credit card</b> — those amounts appear on the Credit Cards tab
        statement breakdown. Click <b>Edit</b> to change plans and card/BT balance.
        Margin loan is edited on <b>Investment</b> (holdings section).
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
          {activeLoans.length === 0 && archivedLoans.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
              No instalment plans configured. Click Edit to add one.
            </p>
          ) : (
            <>
              {editLoanRows(activeLoans)}
              {archivedLoans.length > 0 && (
                <details className="debt-archive" style={{ marginTop: 12 }}>
                  <summary>Archive — {archivedLoans.length} ended</summary>
                  <div style={{ marginTop: 10 }}>{editLoanRows(archivedLoans)}</div>
                </details>
              )}
            </>
          )}
          <div className="toolbar">
            <button type="button" className="btn ghost sm" onClick={addLoan}>
              + Add loan
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            {activeLoans.length === 0 ? (
              <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
                No active instalment plans.{" "}
                {archivedLoans.length > 0
                  ? "See archive below for ended plans."
                  : "Click Edit to add one."}
              </p>
            ) : (
              <table>
                {loanTableHead}
                <tbody>{activeLoans.map(loanRow)}</tbody>
              </table>
            )}
          </div>
          {archivedLoans.length > 0 && (
            <details className="debt-archive">
              <summary>
                Archive — {archivedLoans.length} ended plan
                {archivedLoans.length === 1 ? "" : "s"}
              </summary>
              <div className="card" style={{ marginTop: 0, borderTop: "none" }}>
                <table>
                  {loanTableHead}
                  <tbody>{archivedLoans.map(loanRow)}</tbody>
                </table>
              </div>
            </details>
          )}
        </>
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
