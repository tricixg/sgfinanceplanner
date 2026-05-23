"use client";

import { useState } from "react";
import type { CreditCard, DashboardState } from "@/lib/types";
import type { OtherLoan, OtherLoanType } from "@/lib/other-loans/types";
import { creditCardLabel, ensureCreditCardIds } from "@/lib/finance/card-linking";
import { fmt2 } from "@/lib/finance/helpers";
import { fetchJson } from "@/lib/fetch-json";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  editing: boolean;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
};

function NumInput({
  value,
  onChange,
  step,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step ?? 1}
      disabled={disabled}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  );
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function OtherLoanPayModal({
  loan,
  onClose,
  onPaid,
}: {
  loan: OtherLoan;
  onClose: () => void;
  onPaid: () => Promise<void>;
}) {
  const { accounts } = useFinancialAccounts();
  const cashAccounts = accounts.filter((a) => a.accountType === "cash");
  const [amount, setAmount] = useState(String(loan.outstanding));
  const [financialAccountId, setFinancialAccountId] = useState(
    loan.defaultFinancialAccountId ?? cashAccounts[0]?.id ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setMsg("Enter a valid amount");
      return;
    }
    if (!financialAccountId) {
      setMsg("Select a cash account");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/other-loans/${loan.id}/pay`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amt, financialAccountId }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Payment failed");
      await onPaid();
      onClose();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="card modal-panel">
        <h3>Pay loan</h3>
        <p className="note">
          {loan.name} · outstanding {fmt2(loan.outstanding)}
        </p>
        <form onSubmit={(e) => void submit(e)}>
          <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0 }}>
            <label>
              Amount (SGD)
              <input
                type="number"
                step={0.01}
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label>
              Pay from (cash)
              <select
                value={financialAccountId}
                onChange={(e) => setFinancialAccountId(e.target.value)}
                required
              >
                <option value="">— Select —</option>
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          {msg && <p className="note" style={{ color: "var(--rust)" }}>{msg}</p>}
          <div className="toolbar">
            <button type="button" className="btn ghost sm" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn sm" disabled={saving}>
              {saving ? "Saving…" : "Record payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function OtherLoansPanel({
  state,
  setState,
  editing,
  onSaved,
  onError,
}: Props) {
  const cardsWithIds = ensureCreditCardIds(state.creditCards);
  const { accounts } = useFinancialAccounts();
  const loans = state.otherLoans ?? [];
  const [payLoan, setPayLoan] = useState<OtherLoan | null>(null);
  const [saving, setSaving] = useState(false);

  const patchLoan = (i: number, patch: Partial<OtherLoan>) => {
    setState((prev) => ({
      ...prev,
      otherLoans: (prev.otherLoans ?? []).map((l, j) =>
        j === i ? { ...l, ...patch } : l
      ),
    }));
  };

  const addLoan = () => {
    setState((prev) => ({
      ...prev,
      otherLoans: [
        ...(prev.otherLoans ?? []),
        {
          name: "New loan",
          loanType: "personal" as OtherLoanType,
          principal: 0,
          outstanding: 0,
          interestRateApr: 0,
          feesPaid: 0,
          amountPaid: 0,
        },
      ],
    }));
  };

  const removeLoan = (i: number) => {
    setState((prev) => ({
      ...prev,
      otherLoans: (prev.otherLoans ?? []).filter((_, j) => j !== i),
    }));
  };

  const saveOtherLoans = async () => {
    setSaving(true);
    try {
      const { res, data } = await fetchJson<{ otherLoans?: OtherLoan[]; error?: string }>(
        "/api/other-loans",
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ otherLoans: loans }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setState((prev) => ({ ...prev, otherLoans: data.otherLoans ?? loans }));
      onSaved("Other loans saved");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const reloadAfterPay = async () => {
    const { res, data } = await fetchJson<{ otherLoans?: OtherLoan[] }>(
      "/api/other-loans",
      { credentials: "include" }
    );
    if (res.ok) {
      setState((prev) => ({ ...prev, otherLoans: data.otherLoans ?? [] }));
    }
    onSaved("Payment recorded");
  };

  const activeLoans = loans.filter((l) => !l.paidAt);

  return (
    <>
      {editing ? (
        <div className="card">
          <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0 }}>
            <div className="editrow head other-loans">
              <span>Name</span>
              <span>Type</span>
              <span>Source card</span>
              <span>Principal</span>
              <span>Outstanding</span>
              <span>Interest %</span>
              <span>Due date</span>
              <span>Tenure (mo)</span>
              <span>Fees paid</span>
              <span>Pay from</span>
              <span></span>
            </div>
            {loans.length === 0 ? (
              <p className="note" style={{ fontStyle: "italic" }}>
                No other loans yet. Add balance transfers or personal loans below.
              </p>
            ) : (
              loans.map((l, i) => (
                <div className="editrow other-loans" key={i}>
                  <input
                    type="text"
                    value={l.name}
                    onChange={(e) => patchLoan(i, { name: e.target.value })}
                  />
                  <select
                    value={l.loanType}
                    onChange={(e) =>
                      patchLoan(i, { loanType: e.target.value as OtherLoanType })
                    }
                  >
                    <option value="personal">Personal</option>
                    <option value="balance_transfer">Balance transfer</option>
                  </select>
                  {l.loanType === "balance_transfer" ? (
                    <select
                      value={l.sourceCreditCardId ?? ""}
                      onChange={(e) =>
                        patchLoan(i, {
                          sourceCreditCardId: e.target.value || undefined,
                        })
                      }
                    >
                      <option value="">— Source card —</option>
                      {cardsWithIds.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span>—</span>
                  )}
                  <NumInput
                    value={l.principal}
                    step={0.01}
                    disabled={saving}
                    onChange={(v) => patchLoan(i, { principal: v, outstanding: v })}
                  />
                  <NumInput
                    value={l.outstanding}
                    step={0.01}
                    disabled={saving}
                    onChange={(v) => patchLoan(i, { outstanding: v })}
                  />
                  <NumInput
                    value={l.interestRateApr}
                    step={0.01}
                    disabled={saving}
                    onChange={(v) => patchLoan(i, { interestRateApr: v })}
                  />
                  <input
                    type="date"
                    value={l.dueDate ?? ""}
                    onChange={(e) =>
                      patchLoan(i, { dueDate: e.target.value || undefined })
                    }
                  />
                  <NumInput
                    value={l.tenureMonths ?? 0}
                    step={1}
                    disabled={saving}
                    onChange={(v) => patchLoan(i, { tenureMonths: v || undefined })}
                  />
                  <NumInput
                    value={l.feesPaid}
                    step={0.01}
                    disabled={saving}
                    onChange={(v) => patchLoan(i, { feesPaid: v })}
                  />
                  <select
                    value={l.defaultFinancialAccountId ?? ""}
                    onChange={(e) =>
                      patchLoan(i, {
                        defaultFinancialAccountId: e.target.value || undefined,
                      })
                    }
                    aria-label="Default pay-from account"
                  >
                    <option value="">Pay from…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn del sm"
                    onClick={() => removeLoan(i)}
                    disabled={saving}
                  >
                    del
                  </button>
                </div>
              ))
            )}
            <div className="toolbar">
              <button type="button" className="btn ghost sm" onClick={addLoan} disabled={saving}>
                + Add other loan
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() => void saveOtherLoans()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save other loans"}
              </button>
            </div>
          </fieldset>
        </div>
      ) : activeLoans.length === 0 ? (
        <p className="note" style={{ fontStyle: "italic" }}>
          No other loans. Click Edit to add balance transfers or personal loans.
        </p>
      ) : (
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>Loan</th>
                <th>Type</th>
                <th>Source card</th>
                <th>Due</th>
                <th>Tenure</th>
                <th>Principal</th>
                <th>Outstanding</th>
                <th>Interest %</th>
                <th>Fees paid</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeLoans.map((l, i) => (
                <tr key={l.id ?? i}>
                  <td>{l.name}</td>
                  <td>
                    {l.loanType === "balance_transfer" ? "Balance transfer" : "Personal"}
                  </td>
                  <td>
                    {l.loanType === "balance_transfer"
                      ? creditCardLabel(cardsWithIds, l.sourceCreditCardId)
                      : "—"}
                  </td>
                  <td>{l.dueDate ? fmtDate(l.dueDate) : "—"}</td>
                  <td className="num">{l.tenureMonths ? `${l.tenureMonths} mo` : "—"}</td>
                  <td className="num">{fmt2(l.principal)}</td>
                  <td className="num">{fmt2(l.outstanding)}</td>
                  <td className="num">{l.interestRateApr.toFixed(2)}</td>
                  <td className="num">{fmt2(l.feesPaid)}</td>
                  <td>
                    {l.outstanding > 0 && l.id && (
                      <button type="button" className="btn sm" onClick={() => setPayLoan(l)}>
                        Pay
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payLoan && (
        <OtherLoanPayModal
          loan={payLoan}
          onClose={() => setPayLoan(null)}
          onPaid={reloadAfterPay}
        />
      )}
    </>
  );
}
