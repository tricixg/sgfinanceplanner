"use client";

import { useMemo, useState } from "react";
import { DecimalTextInput } from "@/components/DecimalInput";
import { fmt2 } from "@/lib/finance/helpers";
import {
  addAmounts,
  computeAmounts,
  daysInclusive,
  daysInYear,
  paidDaysByEntry,
  salaryMonthsForEntry,
  zeroAmounts,
  type OncallAmounts,
} from "@/lib/oncall/calc";
import { fmtOncallDay, fmtSalaryMonth, plural } from "@/lib/oncall/format";
import type { OncallEntry, OncallEntryInput, OncallPayment, OncallSettings } from "@/lib/oncall/types";

type Props = {
  entries: OncallEntry[];
  payments: OncallPayment[];
  settings: OncallSettings;
  year: number;
  onAdd: (input: OncallEntryInput) => Promise<void>;
  onUpdate: (id: string, input: OncallEntryInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRecordPay: (entryId: string) => void;
  onMessage: (text: string, kind?: "err" | "warn") => void;
};

type Draft = { startDate: string; endDate: string; note: string; rate: string };

function MoneyCells({ a, muted }: { a: OncallAmounts; muted?: boolean }) {
  const cls = muted ? "num oncall-preview" : "num";
  return (
    <>
      <td className={cls}>{fmt2(a.gross)}</td>
      <td className={cls}>{fmt2(a.employeeCpf)}</td>
      <td className={cls}>{fmt2(a.employerCpf)}</td>
      <td className={cls}>
        <b>{fmt2(a.takeHome)}</b>
      </td>
    </>
  );
}

function DaysPill({ days }: { days: number }) {
  return <span className={days ? "oncall-days" : "oncall-days empty"}>{days || "–"}</span>;
}

export function OncallLogTable({
  entries,
  payments,
  settings,
  year,
  onAdd,
  onUpdate,
  onDelete,
  onRecordPay,
  onMessage,
}: Props) {
  const [draft, setDraft] = useState<Draft>({ startDate: "", endDate: "", note: "", rate: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const paid = useMemo(() => paidDaysByEntry(payments), [payments]);
  const rows = useMemo(
    () => [...entries].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [entries]
  );

  const draftRate = draft.rate === "" ? settings.dailyRate : Number(draft.rate);
  const draftDays = daysInclusive(draft.startDate, draft.endDate);

  const overlapWarning = (startDate: string, endDate: string, skipId?: string) => {
    if (!daysInclusive(startDate, endDate)) return "";
    const hit = entries.find(
      (e) => e.id !== skipId && e.startDate <= endDate && e.endDate >= startDate
    );
    return hit
      ? `Heads up: this overlaps ${fmtOncallDay(hit.startDate)} to ${fmtOncallDay(hit.endDate)}. You can still log it.`
      : "";
  };

  const setDraftDates = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    if (patch.startDate && (!next.endDate || next.endDate < patch.startDate)) next.endDate = patch.startDate;
    setDraft(next);
    const warn = overlapWarning(next.startDate, next.endDate);
    onMessage(warn, warn ? "warn" : undefined);
  };

  const add = async () => {
    if (!draftDays) {
      onMessage("Pick both a from and a to date.", "err");
      return;
    }
    if (!(draftRate >= 0)) {
      onMessage("Enter a daily rate of 0 or more.", "err");
      return;
    }
    setBusyId("add");
    try {
      await onAdd({ startDate: draft.startDate, endDate: draft.endDate, dailyRate: draftRate, note: draft.note });
      setDraft({ startDate: "", endDate: "", note: "", rate: "" });
      onMessage(`Logged ${plural(draftDays, "day")}. It shows as unpaid until you record a payment.`);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Failed to log on-call days", "err");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (e: OncallEntry) => {
    setEditingId(e.id);
    setEdit({ startDate: e.startDate, endDate: e.endDate, note: e.note, rate: String(e.dailyRate) });
    setConfirmDeleteId(null);
    onMessage("");
  };

  const saveEdit = async (id: string) => {
    if (!edit) return;
    const rate = Number(edit.rate);
    if (!daysInclusive(edit.startDate, edit.endDate)) {
      onMessage("The to date is before the from date. Swap them or pick a later end date.", "err");
      return;
    }
    if (!(rate >= 0)) {
      onMessage("Enter a daily rate of 0 or more.", "err");
      return;
    }
    setBusyId(id);
    try {
      await onUpdate(id, { startDate: edit.startDate, endDate: edit.endDate, dailyRate: rate, note: edit.note });
      setEditingId(null);
      setEdit(null);
      onMessage("Saved.");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Failed to save", "err");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await onDelete(id);
      setConfirmDeleteId(null);
      onMessage("Deleted.");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Failed to delete", "err");
    } finally {
      setBusyId(null);
    }
  };

  const total = rows.reduce(
    (t, e) => addAmounts(t, computeAmounts(daysInclusive(e.startDate, e.endDate), e.dailyRate, settings)),
    zeroAmounts()
  );
  const paidTotal = rows.reduce(
    (s, e) => s + Math.min(paid.get(e.id) ?? 0, daysInclusive(e.startDate, e.endDate)),
    0
  );

  const statusCell = (e: OncallEntry) => {
    const d = daysInclusive(e.startDate, e.endDate);
    const p = Math.min(paid.get(e.id) ?? 0, d);
    const cls = p >= d ? "paid" : p > 0 ? "part" : "unpaid";
    const months = salaryMonthsForEntry(payments, e.id).map(fmtSalaryMonth).join(", ");
    return (
      <td className="oncall-status-cell">
        <div className="oncall-status">
          <span className={`oncall-st ${cls}`}>
            {p >= d ? "Paid" : p > 0 ? `${p} of ${d} paid` : "Unpaid"}
          </span>
          {p > 0 ? (
            <span className={`oncall-meter ${cls}`}>
              <i style={{ width: `${(p / d) * 100}%` }} />
            </span>
          ) : null}
          {months ? <span className="oncall-months">{months}</span> : null}
        </div>
      </td>
    );
  };

  return (
    <div className="table-scroll oncall-table-wrap">
      <table className="oncall-table oncall-log">
        <thead>
          <tr>
            <th>From</th>
            <th>To</th>
            <th className="num">Days</th>
            <th className="left">Note</th>
            <th className="num">Rate / day</th>
            <th className="num">Gross</th>
            <th className="num">Employee CPF</th>
            <th className="num">Employer CPF</th>
            <th className="num">Take-home</th>
            <th className="left">Paid</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr className="oncall-add">
            <td>
              <input
                type="date"
                aria-label="From date"
                value={draft.startDate}
                onChange={(e) => setDraftDates({ startDate: e.target.value })}
              />
            </td>
            <td>
              <input
                type="date"
                aria-label="To date"
                value={draft.endDate}
                min={draft.startDate || undefined}
                onChange={(e) => setDraftDates({ endDate: e.target.value })}
              />
            </td>
            <td className="num">
              <DaysPill days={draftDays} />
            </td>
            <td className="left">
              <input
                type="text"
                aria-label="Note"
                placeholder="Optional note"
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void add();
                }}
              />
            </td>
            <td className="num">
              <DecimalTextInput
                aria-label="Rate per day"
                className="oncall-rate-in"
                value={draft.rate === "" ? String(settings.dailyRate) : draft.rate}
                onChange={(v) => setDraft({ ...draft, rate: v })}
              />
            </td>
            <MoneyCells a={computeAmounts(draftDays, draftRate >= 0 ? draftRate : 0, settings)} muted />
            <td />
            <td>
              <button
                type="button"
                className="btn sm"
                disabled={!draftDays || busyId === "add"}
                onClick={() => void add()}
              >
                {busyId === "add" ? "Logging…" : "Log"}
              </button>
            </td>
          </tr>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={11} className="oncall-empty">
                No on-call days logged yet. Pick a from and to date above, then press Log.
              </td>
            </tr>
          ) : null}
          {rows.map((e) => {
            const d = daysInclusive(e.startDate, e.endDate);
            if (editingId === e.id && edit) {
              const ed = daysInclusive(edit.startDate, edit.endDate);
              return (
                <tr key={e.id} className="oncall-editing">
                  <td>
                    <input
                      type="date"
                      aria-label="From date"
                      value={edit.startDate}
                      onChange={(ev) => setEdit({ ...edit, startDate: ev.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      aria-label="To date"
                      value={edit.endDate}
                      onChange={(ev) => setEdit({ ...edit, endDate: ev.target.value })}
                    />
                  </td>
                  <td className="num">
                    <DaysPill days={ed} />
                  </td>
                  <td className="left">
                    <input
                      type="text"
                      aria-label="Note"
                      value={edit.note}
                      onChange={(ev) => setEdit({ ...edit, note: ev.target.value })}
                    />
                  </td>
                  <td className="num">
                    <DecimalTextInput
                      aria-label="Rate per day"
                      className="oncall-rate-in"
                      value={edit.rate}
                      onChange={(v) => setEdit({ ...edit, rate: v })}
                    />
                  </td>
                  <MoneyCells a={computeAmounts(ed, Number(edit.rate) || 0, settings)} muted />
                  {statusCell(e)}
                  <td>
                    <div className="oncall-actions">
                      <button type="button" className="btn sm" disabled={busyId === e.id} onClick={() => void saveEdit(e.id)}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={busyId === e.id}
                        onClick={() => {
                          setEditingId(null);
                          setEdit(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              );
            }
            const inYear = daysInYear(e, year);
            const owed = d - (paid.get(e.id) ?? 0);
            return (
              <tr key={e.id}>
                <td>{fmtOncallDay(e.startDate)}</td>
                <td>{fmtOncallDay(e.endDate)}</td>
                <td className="num oncall-nowrap">
                  <DaysPill days={d} />
                  {inYear && inYear !== d ? (
                    <span className="oncall-yr" title={`${inYear} of these days fall in ${year}`}>
                      {inYear}d in {year}
                    </span>
                  ) : null}
                </td>
                <td className="left oncall-note">{e.note}</td>
                <td className="num">{fmt2(e.dailyRate)}</td>
                <MoneyCells a={computeAmounts(d, e.dailyRate, settings)} />
                {statusCell(e)}
                <td>
                  {confirmDeleteId === e.id ? (
                    <div className="oncall-actions">
                      <button type="button" className="btn del sm" disabled={busyId === e.id} onClick={() => void remove(e.id)}>
                        {busyId === e.id ? "Deleting…" : "Confirm delete"}
                      </button>
                      <button type="button" className="btn ghost sm" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="oncall-actions">
                      {owed > 0 ? (
                        <button type="button" className="btn ghost sm" onClick={() => onRecordPay(e.id)}>
                          Record pay
                        </button>
                      ) : null}
                      <button type="button" className="btn ghost sm" onClick={() => startEdit(e)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn del sm"
                        onClick={() => {
                          const p = paid.get(e.id) ?? 0;
                          if (p) {
                            onMessage(
                              `This stretch has ${plural(p, "paid day")} linked to income. Delete those payments below first.`,
                              "err"
                            );
                            return;
                          }
                          setConfirmDeleteId(e.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {rows.length ? (
          <tfoot>
            <tr>
              <td colSpan={2}>All entries</td>
              <td className="num">{total.days}</td>
              <td />
              <td />
              <MoneyCells a={total} />
              <td className="left">
                {paidTotal} of {total.days} days paid
              </td>
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
