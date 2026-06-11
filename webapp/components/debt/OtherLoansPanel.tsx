"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardState } from "@/lib/types";
import type { OtherLoan, OtherLoanType } from "@/lib/other-loans/types";
import type { OtherLoanPaymentRow } from "@/lib/other-loans/payment-history";
import { creditCardLabel, ensureCreditCardIds } from "@/lib/finance/card-linking";
import { fmt2 } from "@/lib/finance/helpers";
import { fetchJson } from "@/lib/fetch-json";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { dispatchDomainEvent } from "@/lib/events/domain-events";
import { DecimalInput, DecimalTextInput } from "@/components/DecimalInput";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  editing: boolean;
  saveRequestToken?: number;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
};

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtPaymentWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  });
}

function defaultOtherLoan(loanType: OtherLoanType): OtherLoan {
  if (loanType === "balance_transfer") {
    return {
      name: "New balance transfer",
      loanType: "balance_transfer",
      principal: 0,
      outstanding: 0,
      interestRateApr: 0,
      feesPaid: 0,
      amountPaid: 0,
    };
  }
  return {
    name: "New personal loan",
    loanType: "personal",
    principal: 0,
    outstanding: 0,
    interestRateApr: 0,
    feesPaid: 0,
    amountPaid: 0,
  };
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
  const [payments, setPayments] = useState<OtherLoanPaymentRow[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsError, setPaymentsError] = useState("");

  useEffect(() => {
    if (!loan.id) {
      setPayments([]);
      setPaymentsLoading(false);
      return;
    }

    let cancelled = false;
    setPaymentsLoading(true);
    setPaymentsError("");

    void (async () => {
      try {
        const { res, data } = await fetchJson<{
          payments?: OtherLoanPaymentRow[];
          error?: string;
        }>(`/api/other-loans/${loan.id}/payments`, { credentials: "include" });

        if (!res.ok) throw new Error(data.error ?? "Failed to load payment history");
        if (!cancelled) {
          setPayments(data.payments ?? []);
          console.info("[OtherLoanPayModal] payment history loaded", {
            loanId: loan.id,
            count: data.payments?.length ?? 0,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setPaymentsError(e instanceof Error ? e.message : "Failed to load payment history");
        }
      } finally {
        if (!cancelled) setPaymentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loan.id]);

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
      <div className="card modal-panel" style={{ maxWidth: 520 }}>
        <h3>Pay personal loan</h3>
        <p className="note">
          {loan.name} · outstanding {fmt2(loan.outstanding)}
          {loan.amountPaid > 0 ? ` · paid ${fmt2(loan.amountPaid)}` : ""}
        </p>

        <div className="other-loan-pay-history">
          <h4 className="other-loan-pay-history-title">Payment history</h4>
          {paymentsLoading ? (
            <p className="note">Loading payments…</p>
          ) : paymentsError ? (
            <p className="note" style={{ color: "var(--rust)" }}>
              {paymentsError}
            </p>
          ) : payments.length === 0 ? (
            <p className="note" style={{ fontStyle: "italic" }}>
              No payments recorded yet.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="other-loan-pay-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Account</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtPaymentWhen(p.occurredAt)}</td>
                      <td className="num">{fmt2(p.amount)}</td>
                      <td>{p.accountName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <hr style={{ margin: "16px 0" }} />

        <form onSubmit={(e) => void submit(e)}>
          <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0 }}>
            <label>
              Amount (SGD)
              <DecimalTextInput value={amount} onChange={setAmount} required />
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

function PayFromSelect({
  value,
  accounts,
  disabled,
  onChange,
}: {
  value: string;
  accounts: { id: string; name: string }[];
  disabled?: boolean;
  onChange: (id: string | undefined) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || undefined)}
      aria-label="Default pay-from account"
    >
      <option value="">Pay from…</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

export function OtherLoansPanel({
  state,
  setState,
  editing,
  saveRequestToken = 0,
  onSaved,
  onError,
}: Props) {
  const cardsWithIds = ensureCreditCardIds(state.creditCards);
  const { accounts } = useFinancialAccounts();
  const loans = useMemo(() => state.otherLoans ?? [], [state.otherLoans]);
  const [payLoan, setPayLoan] = useState<OtherLoan | null>(null);
  const [saving, setSaving] = useState(false);

  const indexedLoans = useMemo(
    () => loans.map((loan, index) => ({ loan, index })),
    [loans]
  );
  const balanceTransfers = useMemo(
    () => indexedLoans.filter(({ loan }) => loan.loanType === "balance_transfer"),
    [indexedLoans]
  );
  const personalLoans = useMemo(
    () => indexedLoans.filter(({ loan }) => loan.loanType === "personal"),
    [indexedLoans]
  );
  const activePersonalLoans = personalLoans.filter(({ loan }) => !loan.paidAt);

  const patchLoan = (i: number, patch: Partial<OtherLoan>) => {
    setState((prev) => ({
      ...prev,
      otherLoans: (prev.otherLoans ?? []).map((l, j) =>
        j === i ? { ...l, ...patch } : l
      ),
    }));
  };

  const addLoan = (loanType: OtherLoanType) => {
    setState((prev) => ({
      ...prev,
      otherLoans: [...(prev.otherLoans ?? []), defaultOtherLoan(loanType)],
    }));
    console.info("[OtherLoansPanel] added loan draft", { loanType });
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

  useEffect(() => {
    if (saveRequestToken <= 0) return;
    void saveOtherLoans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveRequestToken]);

  const reloadAfterPay = async () => {
    const { res, data } = await fetchJson<{ otherLoans?: OtherLoan[] }>(
      "/api/other-loans",
      { credentials: "include" }
    );
    if (res.ok) {
      setState((prev) => ({ ...prev, otherLoans: data.otherLoans ?? [] }));
      dispatchDomainEvent(["otherLoans:changed", "expense:changed", "cards:changed"]);
    }
    onSaved("Payment recorded");
  };

  const renderBalanceTransferEditRows = () => {
    if (balanceTransfers.length === 0) {
      return (
        <p className="note" style={{ fontStyle: "italic" }}>
          No balance transfers yet.
        </p>
      );
    }
    return balanceTransfers.map(({ loan: l, index: i }) => (
      <div className="editrow other-loans-bt" key={l.id ?? `bt-draft-${i}`}>
        <input
          type="text"
          value={l.name}
          onChange={(e) => patchLoan(i, { name: e.target.value })}
        />
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
        <DecimalInput
          value={l.principal}
          step={0.01}
          disabled={saving}
          onChange={(v) => patchLoan(i, { principal: v, outstanding: v })}
        />
        <DecimalInput
          value={l.outstanding}
          step={0.01}
          disabled={saving}
          onChange={(v) => patchLoan(i, { outstanding: v })}
        />
        <DecimalInput
          value={l.interestRateApr}
          step={0.01}
          disabled={saving}
          onChange={(v) => patchLoan(i, { interestRateApr: v })}
        />
        <input
          type="date"
          value={l.dueDate ?? ""}
          onChange={(e) => patchLoan(i, { dueDate: e.target.value || undefined })}
        />
        <input
          type="date"
          value={l.btStartDate ?? ""}
          onChange={(e) => patchLoan(i, { btStartDate: e.target.value || undefined })}
        />
        <DecimalInput
          value={l.financeCharge ?? 0}
          step={0.01}
          disabled={saving}
          onChange={(v) => patchLoan(i, { financeCharge: v })}
        />
        <DecimalInput
          value={l.tenureMonths ?? 0}
          step={1}
          disabled={saving}
          onChange={(v) => patchLoan(i, { tenureMonths: v || undefined })}
        />
        <PayFromSelect
          value={l.defaultFinancialAccountId ?? ""}
          accounts={accounts}
          disabled={saving}
          onChange={(id) => patchLoan(i, { defaultFinancialAccountId: id })}
        />
        <button
          type="button"
          className="btn del sm"
          onClick={() => removeLoan(i)}
          disabled={saving}
        >
          del
        </button>
      </div>
    ));
  };

  const renderPersonalLoanEditRows = () => {
    if (personalLoans.length === 0) {
      return (
        <p className="note" style={{ fontStyle: "italic" }}>
          No personal loans yet.
        </p>
      );
    }
    return personalLoans.map(({ loan: l, index: i }) => (
      <div className="editrow other-loans-personal" key={l.id ?? `personal-draft-${i}`}>
        <input
          type="text"
          value={l.name}
          onChange={(e) => patchLoan(i, { name: e.target.value })}
        />
        <DecimalInput
          value={l.principal}
          step={0.01}
          disabled={saving}
          onChange={(v) => patchLoan(i, { principal: v, outstanding: v })}
        />
        <DecimalInput
          value={l.outstanding}
          step={0.01}
          disabled={saving}
          onChange={(v) => patchLoan(i, { outstanding: v })}
        />
        <DecimalInput
          value={l.interestRateApr}
          step={0.01}
          disabled={saving}
          onChange={(v) => patchLoan(i, { interestRateApr: v })}
        />
        <input
          type="date"
          value={l.dueDate ?? ""}
          onChange={(e) => patchLoan(i, { dueDate: e.target.value || undefined })}
        />
        <DecimalInput
          value={l.tenureMonths ?? 0}
          step={1}
          disabled={saving}
          onChange={(v) => patchLoan(i, { tenureMonths: v || undefined })}
        />
        <DecimalInput
          value={l.feesPaid}
          step={0.01}
          disabled={saving}
          onChange={(v) => patchLoan(i, { feesPaid: v })}
        />
        <PayFromSelect
          value={l.defaultFinancialAccountId ?? ""}
          accounts={accounts}
          disabled={saving}
          onChange={(id) => patchLoan(i, { defaultFinancialAccountId: id })}
        />
        <label
          className="note"
          style={{ display: "flex", alignItems: "center", gap: 4, margin: 0 }}
          title="Outstanding still shown here; omitted from ME net worth only"
        >
          <input
            type="checkbox"
            checked={Boolean(l.excludeFromNetWorth)}
            onChange={(e) => patchLoan(i, { excludeFromNetWorth: e.target.checked })}
          />
          Exclude
        </label>
        <button
          type="button"
          className="btn del sm"
          onClick={() => removeLoan(i)}
          disabled={saving}
        >
          del
        </button>
      </div>
    ));
  };

  const activeBalanceTransfers = balanceTransfers.filter(({ loan }) => !loan.paidAt);

  return (
    <>
      {editing ? (
        <div className="card">
          <section className="other-loans-section">
            <h3 className="other-loans-section-title">Balance transfers</h3>
            <div className="table-scroll">
              <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0 }}>
                <div className="editrow head other-loans-bt">
                  <span>Name</span>
                  <span>Source card</span>
                  <span>Principal</span>
                  <span>Outstanding</span>
                  <span>Interest %</span>
                  <span>Due date</span>
                  <span>BT start</span>
                  <span>BT charge</span>
                  <span>Tenure (mo)</span>
                  <span>Pay from</span>
                  <span></span>
                </div>
                {renderBalanceTransferEditRows()}
              </fieldset>
            </div>
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => addLoan("balance_transfer")}
                disabled={saving}
              >
                + Add balance transfer
              </button>
            </div>
          </section>

          <section className="other-loans-section">
            <h3 className="other-loans-section-title">Personal loans</h3>
            <div className="table-scroll">
              <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0 }}>
                <div className="editrow head other-loans-personal">
                  <span>Name</span>
                  <span>Principal</span>
                  <span>Outstanding</span>
                  <span>Interest %</span>
                  <span>Due date</span>
                  <span>Tenure (mo)</span>
                  <span>Fees paid</span>
                  <span>Pay from</span>
                  <span>Net worth</span>
                  <span></span>
                </div>
                {renderPersonalLoanEditRows()}
              </fieldset>
            </div>
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => addLoan("personal")}
                disabled={saving}
              >
                + Add personal loan
              </button>
            </div>
          </section>
        </div>
      ) : activeBalanceTransfers.length === 0 && activePersonalLoans.length === 0 ? (
        <p className="note" style={{ fontStyle: "italic" }}>
          No other loans. Click Edit to add balance transfers or personal loans.
        </p>
      ) : (
        <>
          {activeBalanceTransfers.length > 0 ? (
            <section className="other-loans-section card table-scroll">
              <h3 className="other-loans-section-title">Balance transfers</h3>
              <table className="other-loans-table other-loans-table-bt">
                <thead>
                  <tr>
                    <th>Loan</th>
                    <th>Source card</th>
                    <th>Due</th>
                    <th>BT start</th>
                    <th>BT charge</th>
                    <th>Tenure</th>
                    <th>Principal</th>
                    <th>Outstanding</th>
                    <th>Interest %</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBalanceTransfers.map(({ loan: l }) => (
                    <tr key={l.id ?? l.name}>
                      <td>{l.name}</td>
                      <td>{creditCardLabel(cardsWithIds, l.sourceCreditCardId)}</td>
                      <td>{l.dueDate ? fmtDate(l.dueDate) : "—"}</td>
                      <td>{l.btStartDate ? fmtDate(l.btStartDate) : "—"}</td>
                      <td className="num">{fmt2(l.financeCharge ?? 0)}</td>
                      <td className="num">{l.tenureMonths ? `${l.tenureMonths} mo` : "—"}</td>
                      <td className="num">{fmt2(l.principal)}</td>
                      <td className="num">{fmt2(l.outstanding)}</td>
                      <td className="num">{l.interestRateApr.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {activePersonalLoans.length > 0 ? (
            <section className="other-loans-section card table-scroll">
              <h3 className="other-loans-section-title">Personal loans</h3>
              <table className="other-loans-table other-loans-table-personal">
                <thead>
                  <tr>
                    <th>Loan</th>
                    <th>Due</th>
                    <th>Tenure</th>
                    <th>Principal</th>
                    <th>Outstanding</th>
                    <th>Interest %</th>
                    <th>Fees paid</th>
                    <th>Net worth</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activePersonalLoans.map(({ loan: l }) => (
                    <tr key={l.id ?? l.name}>
                      <td>{l.name}</td>
                      <td>{l.dueDate ? fmtDate(l.dueDate) : "—"}</td>
                      <td className="num">{l.tenureMonths ? `${l.tenureMonths} mo` : "—"}</td>
                      <td className="num">{fmt2(l.principal)}</td>
                      <td className="num">{fmt2(l.outstanding)}</td>
                      <td className="num">{l.interestRateApr.toFixed(2)}</td>
                      <td className="num">{fmt2(l.feesPaid)}</td>
                      <td>
                        {l.excludeFromNetWorth ? "Excluded" : "Included"}
                      </td>
                      <td>
                        {l.outstanding > 0 && l.id ? (
                          <button type="button" className="btn sm" onClick={() => setPayLoan(l)}>
                            Pay
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      )}

      {payLoan ? (
        <OtherLoanPayModal
          loan={payLoan}
          onClose={() => setPayLoan(null)}
          onPaid={reloadAfterPay}
        />
      ) : null}
    </>
  );
}
