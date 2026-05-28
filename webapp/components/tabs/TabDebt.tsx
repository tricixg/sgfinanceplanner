"use client";

import { useContext, useState } from "react";
import type { DashboardState, Loan } from "@/lib/types";
import {
  activeLoanOutstanding,
  activeOtherLoansOutstanding,
  creditCardLabel,
  debtBurnDown,
  ensureCreditCardIds,
  partitionLoans,
} from "@/lib/finance";
import type { EnrichedLoan } from "@/lib/finance/debt";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";
import { OtherLoansPanel } from "@/components/debt/OtherLoansPanel";
import { Snackbar } from "@/components/Snackbar";
import { RecurringScheduleFields } from "@/components/recurring/RecurringScheduleFields";
import { useSnackbar } from "@/hooks/useSnackbar";
import { DecimalInput } from "@/components/DecimalInput";
import { AppDataContext } from "@/contexts/app-data-contexts";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
};

export function TabDebt({ state: S, setState }: Props) {
  const appData = useContext(AppDataContext);
  const [editing, setEditing] = useState(false);
  const [editingOtherLoans, setEditingOtherLoans] = useState(false);
  const [otherLoansSaveRequest, setOtherLoansSaveRequest] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loansDraft, setLoansDraft] = useState<Loan[]>(S.loans);
  const snackbar = useSnackbar();
  const loans = editing ? loansDraft : S.loans;
  const viewState = editing ? { ...S, loans } : S;
  const { labels, data } = debtBurnDown(viewState);
  const totalOut = activeLoanOutstanding(viewState);
  const otherOut = activeOtherLoansOutstanding(S);
  const { active: activeLoans, archived: archivedLoans } = partitionLoans(viewState);

  const cardsWithIds = ensureCreditCardIds(S.creditCards);

  const startEditing = () => {
    setLoansDraft(structuredClone(S.loans));
    setEditing(true);
    console.log("[TabDebt] edit mode on");
  };

  const saveLoans = async () => {
    setSaving(true);
    try {
      if (appData?.configured) {
        await appData.saveLoans(loansDraft);
      } else {
        setState((prev) => ({ ...prev, loans: loansDraft }));
      }
      setEditing(false);
      snackbar.show("Instalment plans saved");
      console.info("[TabDebt] loans saved", { count: loansDraft.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save loans";
      snackbar.show(msg, { error: true });
      console.error("[TabDebt] save failed", e);
    } finally {
      setSaving(false);
    }
  };

  const updateLoan = (i: number, key: keyof Loan, val: string | number) => {
    setLoansDraft((prev) =>
      prev.map((l, j) => (j === i ? { ...l, [key]: val } : l))
    );
    console.log("[TabDebt] updated loan draft", i, key, val);
  };

  const patchLoan = (i: number, patch: Partial<Loan>) => {
    setLoansDraft((prev) =>
      prev.map((l, j) => (j === i ? { ...l, ...patch } : l))
    );
    console.log("[TabDebt] patched loan draft", i, patch);
  };

  const setLoanCard = (i: number, cardId: string) => {
    const label = creditCardLabel(cardsWithIds, cardId) || "—";
    setLoansDraft((prev) =>
      prev.map((l, j) =>
        j === i ? { ...l, cardId: cardId || undefined, card: label } : l
      )
    );
    console.log("[TabDebt] linked loan to card", { index: i, cardId, label });
  };

  const addLoan = () => {
    const defaultCardId = cardsWithIds[0]?.id;
    const defaultLabel = creditCardLabel(cardsWithIds, defaultCardId) || "—";
    setLoansDraft((prev) => [
      ...prev,
      {
        name: "New instalment plan",
        card: defaultLabel,
        cardId: defaultCardId,
        monthly: 100,
        out: 0,
        end: "2027-01",
      },
    ]);
    console.log("[TabDebt] added loan to draft");
  };

  const removeLoan = (i: number) => {
    setLoansDraft((prev) => prev.filter((_, j) => j !== i));
    console.log("[TabDebt] removed loan from draft", i);
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
        <DecimalInput
          value={l.monthly}
          step={0.01}
          onChange={(v) => updateLoan(l.index, "monthly", v)}
        />
        <DecimalInput
          value={l.out}
          step={0.01}
          onChange={(v) => updateLoan(l.index, "out", v)}
        />
        <input
          type="text"
          value={l.end}
          onChange={(e) => updateLoan(l.index, "end", e.target.value)}
        />
        <RecurringScheduleFields
          inline
          deductionDay={loans[l.index]?.deductionDay}
          defaultFinancialAccountId={loans[l.index]?.defaultFinancialAccountId}
          onDeductionDayChange={(day) => patchLoan(l.index, { deductionDay: day })}
          onAccountChange={(id) => patchLoan(l.index, { defaultFinancialAccountId: id })}
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
        Monthly instalment plans feed cashflow, calendar, and debt burn-down charts.
        Link each plan to a <b>credit card</b> — those amounts appear on the Credit
        Cards tab statement breakdown. Balance transfers and other non-monthly loans
        live in <b>Other loans</b> below. Margin loan is edited on{" "}
        <b>Investment</b>.
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
          <div className="lbl">Other loans outstanding</div>
          <div className="val">{fmt(otherOut)}</div>
          {!editing && otherOut > 0 && (
            <div className="note">Balance transfers, personal loans</div>
          )}
        </div>
      </div>

      <div className="section-head">
        <h2>Instalment plans</h2>
        {editing ? (
          <button
            type="button"
            className="btn sm"
            disabled={saving}
            onClick={() => void saveLoans()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startEditing}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="card">
          <div className="table-scroll instalment-plans-scroll">
            <div className="instalment-plans-edit-inner">
              <div className="editrow head loans">
                <span>Plan</span>
                <span>Card</span>
                <span>Monthly $</span>
                <span>Outstanding $</span>
                <span>Ends YYYY-MM</span>
                <span>Due</span>
                <span>Pay from</span>
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
            </div>
          </div>
          <div className="toolbar">
            <button type="button" className="btn ghost sm" onClick={addLoan}>
              + Add instalment plan
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card table-scroll instalment-plans-scroll">
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
              <div
                className="card table-scroll instalment-plans-scroll"
                style={{ marginTop: 0, borderTop: "none" }}
              >
                <table>
                  {loanTableHead}
                  <tbody>{archivedLoans.map(loanRow)}</tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}


      <div className="section-head">
        <h2>Other loans</h2>
        {!editingOtherLoans ? (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setEditingOtherLoans(true)}
          >
            Edit
          </button>
        ) : (
          <button
            type="button"
            className="btn sm"
            onClick={() => setOtherLoansSaveRequest((n) => n + 1)}
          >
            Save
          </button>
        )}
      </div>
      <OtherLoansPanel
        state={S}
        setState={setState}
        editing={editingOtherLoans}
        saveRequestToken={otherLoansSaveRequest}
        onSaved={(msg) => {
          if (msg === "Other loans saved") setEditingOtherLoans(false);
          snackbar.show(msg);
        }}
        onError={(msg) => snackbar.show(msg, { error: true })}
      />

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

      <Snackbar
        message={snackbar.message}
        variant={snackbar.variant}
        durationMs={snackbar.durationMs}
        onDismiss={snackbar.dismiss}
      />
    </section>
  );
}
