"use client";

import { useState } from "react";
import { fmt2 } from "@/lib/finance/helpers";
import type { IncomeCategory } from "@/lib/income/types";
import { daysInclusive, paymentAmounts } from "@/lib/oncall/calc";
import { fmtOncallDay, fmtOncallRange, fmtSalaryMonth } from "@/lib/oncall/format";
import type { OncallEntry, OncallPayment, OncallSettings } from "@/lib/oncall/types";
import type { UserSavingsAccount } from "@/lib/savings/types";

type Props = {
  payments: OncallPayment[];
  entries: OncallEntry[];
  settings: OncallSettings;
  accounts: UserSavingsAccount[];
  categories: IncomeCategory[];
  onDelete: (payment: OncallPayment) => Promise<void>;
};

export function OncallPaymentsTable({ payments, entries, settings, accounts, categories, onDelete }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "Deleted account";
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Income";
  const list = [...payments].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn));

  const remove = async (p: OncallPayment) => {
    setBusyId(p.id);
    try {
      await onDelete(p);
      setConfirmId(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="table-scroll oncall-table-wrap">
      <table className="oncall-table oncall-payments">
        <thead>
          <tr>
            <th>Received</th>
            <th className="left">Salary month</th>
            <th className="left">Covers</th>
            <th className="num">Days</th>
            <th className="num">Gross</th>
            <th className="num">Employee CPF</th>
            <th className="num">Employer CPF</th>
            <th className="num">Credited</th>
            <th className="left">Deposited to</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td colSpan={10} className="oncall-empty">
                No payments recorded yet. When a payslip includes on-call pay, press Record payment.
              </td>
            </tr>
          ) : null}
          {list.map((p) => {
            const a = paymentAmounts(p, entries, settings);
            return (
              <tr key={p.id}>
                <td>{fmtOncallDay(p.receivedOn)}</td>
                <td className="left">
                  <b>{fmtSalaryMonth(p.salaryMonth)}</b>
                </td>
                <td className="left">
                  <div className="oncall-covers">
                    {p.items.map((item) => {
                      const e = byId.get(item.entryId);
                      if (!e) return null;
                      const total = daysInclusive(e.startDate, e.endDate);
                      return (
                        <span key={item.id}>
                          {fmtOncallRange(e.startDate, e.endDate)}
                          {item.days < total ? (
                            <em>
                              {" "}
                              ({item.days} of {total} days)
                            </em>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="num">{a.days}</td>
                <td className="num">{fmt2(a.gross)}</td>
                <td className="num">{fmt2(a.employeeCpf)}</td>
                <td className="num">{fmt2(a.employerCpf)}</td>
                <td className="num">
                  <b>{fmt2(p.amount)}</b>
                </td>
                <td className="left">
                  <div className="oncall-covers">
                    {!p.deposited ? (
                      <>
                        <span className="oncall-note">No deposit added</span>
                        <span>
                          <span className="oncall-chip plain">Already deposited</span>
                        </span>
                      </>
                    ) : p.savingsTransactionId ? (
                      <>
                        <span>{accountName(p.accountId)}</span>
                        <span>
                          <span className="oncall-chip">{categoryName(p.incomeCategoryId)}</span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="oncall-note">Deposit was deleted</span>
                        <span>
                          <span className="oncall-chip plain">Removed in Transactions</span>
                        </span>
                      </>
                    )}
                  </div>
                </td>
                <td>
                  {confirmId === p.id ? (
                    <div className="oncall-actions">
                      <button type="button" className="btn del sm" disabled={busyId === p.id} onClick={() => void remove(p)}>
                        {busyId === p.id ? "Deleting…" : "Confirm delete"}
                      </button>
                      <button type="button" className="btn ghost sm" onClick={() => setConfirmId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="oncall-actions">
                      <button type="button" className="btn del sm" onClick={() => setConfirmId(p.id)}>
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
