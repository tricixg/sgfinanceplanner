"use client";

import { useMemo, useState } from "react";
import { DecimalTextInput } from "@/components/DecimalInput";
import { fmt2 } from "@/lib/finance/helpers";
import type { IncomeCategory } from "@/lib/income/types";
import {
  addAmounts,
  computeAmounts,
  daysInclusive,
  findOncallIncomeCategory,
  owedDays,
  paidDaysByEntry,
  zeroAmounts,
} from "@/lib/oncall/calc";
import { fmtOncallDay, fmtOncallRange, fmtSalaryMonth, plural } from "@/lib/oncall/format";
import type { OncallEntry, OncallPayment, OncallPaymentInput, OncallSettings } from "@/lib/oncall/types";
import type { UserSavingsAccount } from "@/lib/savings/types";
import { sgtTodayYmd } from "@/lib/time/sgt";

type Props = {
  entries: OncallEntry[];
  payments: OncallPayment[];
  settings: OncallSettings;
  accounts: UserSavingsAccount[];
  categories: IncomeCategory[];
  /** Pre-tick only this stretch (from a row's "Record pay"); null ticks every unpaid stretch. */
  onlyEntryId: string | null;
  onSave: (input: OncallPaymentInput) => Promise<void>;
  onCancel: () => void;
};

type Row = { entryId: string; on: boolean; days: string };

export function OncallPaymentForm({
  entries,
  payments,
  settings,
  accounts,
  categories,
  onlyEntryId,
  onSave,
  onCancel,
}: Props) {
  const paid = useMemo(() => paidDaysByEntry(payments), [payments]);
  const owing = useMemo(
    () =>
      entries
        .filter((e) => owedDays(e, paid) > 0)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [entries, paid]
  );
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  const today = sgtTodayYmd();
  const [receivedOn, setReceivedOn] = useState(today);
  const [salaryMonth, setSalaryMonth] = useState(today.slice(0, 7));
  const [noDeposit, setNoDeposit] = useState(false);
  const [accountId, setAccountId] = useState(
    settings.defaultAccountId && accounts.some((a) => a.id === settings.defaultAccountId)
      ? settings.defaultAccountId
      : accounts[0]?.id ?? ""
  );
  const [categoryId, setCategoryId] = useState(
    findOncallIncomeCategory(categories)?.id ?? categories[0]?.id ?? ""
  );
  const [rows, setRows] = useState<Row[]>(() =>
    owing.map((e) => ({
      entryId: e.id,
      on: onlyEntryId ? e.id === onlyEntryId : true,
      days: String(owedDays(e, paid)),
    }))
  );
  const [amountText, setAmountText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const rowDays = (r: Row) => (r.on ? Math.max(0, Math.floor(Number(r.days) || 0)) : 0);
  const totals = rows.reduce((t, r) => {
    const e = byId.get(r.entryId);
    return e ? addAmounts(t, computeAmounts(rowDays(r), e.dailyRate, settings)) : t;
  }, zeroAmounts());
  const expected = Math.round(totals.takeHome * 100) / 100;
  const amount = amountText === null ? expected : Number(amountText) || 0;
  const diff = amount - expected;
  const differs = amountText !== null && Math.abs(diff) >= 0.005;

  const accountName = accounts.find((a) => a.id === accountId)?.name ?? "—";
  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? "—";

  const patchRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setErr("");
    if (!receivedOn) return setErr("Pick the date the money came in.");
    if (!salaryMonth) return setErr("Pick the salary month this payslip is for.");
    for (const r of rows) {
      if (!r.on) continue;
      const e = byId.get(r.entryId);
      const owed = e ? owedDays(e, paid) : 0;
      const d = Number(r.days);
      if (e && (!Number.isInteger(d) || d < 1 || d > owed)) {
        return setErr(
          `Days paid for ${fmtOncallRange(e.startDate, e.endDate)} must be a whole number from 1 to ${owed}.`
        );
      }
    }
    if (!totals.days) return setErr("Pick at least one stretch this payslip covers.");
    if (!(amount >= 0)) return setErr("Enter the amount credited, 0 or more.");
    if (!noDeposit) {
      if (!accountId) return setErr("Pick the account the money went into.");
      if (!categoryId) return setErr("Pick an income category.");
      if (!(amount > 0)) return setErr("A deposit needs an amount above 0.");
    }

    setBusy(true);
    try {
      await onSave({
        receivedOn,
        salaryMonth,
        amount,
        deposited: !noDeposit,
        accountId: noDeposit ? null : accountId,
        incomeCategoryId: noDeposit ? null : categoryId,
        items: rows.filter((r) => rowDays(r) > 0).map((r) => ({ entryId: r.entryId, days: rowDays(r) })),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to record payment");
      setBusy(false);
    }
  };

  return (
    <div className="card oncall-pay-card">
      <h3>Record a payment from your payslip</h3>
      <div className="oncall-pay-fields">
        <label className="oncall-field">
          <span className="oncall-lbl">Received on</span>
          <input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        </label>
        <label className="oncall-field">
          <span className="oncall-lbl">Salary month</span>
          <input type="month" value={salaryMonth} onChange={(e) => setSalaryMonth(e.target.value)} />
        </label>
        <label className="oncall-field">
          <span className="oncall-lbl">Deposit to</span>
          <select value={accountId} disabled={noDeposit} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.length === 0 ? <option value="">No accounts — add one on Cash Accounts</option> : null}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="oncall-field">
          <span className="oncall-lbl">Income category</span>
          <select value={categoryId} disabled={noDeposit} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="oncall-check oncall-nodep">
        <input type="checkbox" checked={noDeposit} onChange={(e) => setNoDeposit(e.target.checked)} />
        <span>
          Already deposited, don&apos;t add a deposit
          <span className="oncall-hint">
            Use this for pay you already recorded in your income before using this tracker. The days are
            marked as paid and nothing is added to an account.
          </span>
        </span>
      </label>

      <div className="oncall-field">
        <span className="oncall-lbl">Which days does this payslip cover?</span>
        <span className="oncall-hint">
          Untick a stretch that is not on this payslip. Lower the days if only part of it was paid. The rest
          stays as awaiting payment.
        </span>
      </div>
      <div className="table-scroll oncall-table-wrap">
        <table className="oncall-table oncall-alloc">
          <thead>
            <tr>
              <th />
              <th className="left">Stretch</th>
              <th className="num">Days owed</th>
              <th className="num">Paid now</th>
              <th className="num">Take-home</th>
              <th className="left">Left after this</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const e = byId.get(r.entryId);
              if (!e) return null;
              const owed = owedDays(e, paid);
              const total = daysInclusive(e.startDate, e.endDate);
              const d = Math.min(rowDays(r), owed);
              const left = owed - d;
              return (
                <tr key={r.entryId} className={r.on ? undefined : "off"}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Include ${fmtOncallRange(e.startDate, e.endDate)}`}
                      checked={r.on}
                      onChange={(ev) => patchRow(i, { on: ev.target.checked })}
                    />
                  </td>
                  <td className="left">
                    {fmtOncallRange(e.startDate, e.endDate)}
                    {e.note ? <span className="oncall-note-line">{e.note}</span> : null}
                  </td>
                  <td className="num">
                    {owed}
                    {owed < total ? <span className="oncall-hint"> of {total}</span> : null}
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      className="oncall-days-in"
                      min={1}
                      max={owed}
                      step={1}
                      aria-label="Days paid now"
                      disabled={!r.on}
                      value={r.days}
                      onChange={(ev) => patchRow(i, { days: ev.target.value })}
                    />
                  </td>
                  <td className="num">{r.on ? fmt2(computeAmounts(d, e.dailyRate, settings).takeHome) : "–"}</td>
                  <td className="left">
                    {!r.on ? (
                      <span className="oncall-hint">Not on this payslip</span>
                    ) : left ? (
                      <span className="oncall-left">{plural(left, "day")} for a later payslip</span>
                    ) : (
                      <span className="oncall-hint">Fully paid</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="oncall-pay-totals">
        <div>
          <span className="oncall-lbl">Days</span>
          <b>{totals.days}</b>
        </div>
        <div>
          <span className="oncall-lbl">Gross</span>
          <b>{fmt2(totals.gross)}</b>
        </div>
        <div>
          <span className="oncall-lbl">Employee CPF</span>
          <b>{fmt2(totals.employeeCpf)}</b>
        </div>
        <div>
          <span className="oncall-lbl">Employer CPF</span>
          <b>{fmt2(totals.employerCpf)}</b>
        </div>
        <label className="oncall-field oncall-amt">
          <span className="oncall-lbl">Amount credited (from payslip, S$)</span>
          <DecimalTextInput
            value={amountText ?? expected.toFixed(2)}
            onChange={(v) => setAmountText(v)}
          />
          <span className={differs ? "oncall-diff off" : "oncall-diff"}>
            {differs
              ? `${fmt2(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than the worked-out take-home of ${fmt2(expected)}.`
              : "Worked out from days × rate − employee CPF. Change it to match your payslip."}
          </span>
        </label>
      </div>

      <div className="oncall-income-preview">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v12M6 10l6 6 6-6M4 20h16" />
        </svg>
        <span>
          {!totals.days ? (
            "Pick at least one stretch to include."
          ) : noDeposit ? (
            <>
              Marks {plural(totals.days, "day")} as paid for salary month <b>{fmtSalaryMonth(salaryMonth)}</b>.{" "}
              <b>No deposit is added.</b> The {fmt2(amount)} counts in this tracker&apos;s received total only.
            </>
          ) : (
            <>
              Adds a <b>{fmt2(amount)}</b> deposit to <b>{accountName}</b> under <b>{categoryName}</b> income, dated{" "}
              {fmtOncallDay(receivedOn)}, for salary month <b>{fmtSalaryMonth(salaryMonth)}</b>.
            </>
          )}
        </span>
      </div>

      {err ? <p className="pin-error">{err}</p> : null}
      <div className="toolbar" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={busy || !totals.days} onClick={() => void save()}>
          {busy ? "Saving…" : "Save payment"}
        </button>
      </div>
    </div>
  );
}
