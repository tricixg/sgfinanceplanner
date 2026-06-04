"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CardStatementComputed } from "@/lib/cards/types";
import { roundMoney } from "@/lib/cards/interest-accrual";
import { fmt2 } from "@/lib/finance/helpers";
import { fetchJson } from "@/lib/fetch-json";
import { dispatchDomainEvent } from "@/lib/events/domain-events";
import { useAccounts } from "@/hooks/useAccounts";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { DecimalTextInput } from "@/components/DecimalInput";
import { fmtCardDate } from "@/components/credit-cards/card-ui";

type Props = {
  statement: CardStatementComputed;
  onClose: () => void;
  onPaid: () => Promise<void>;
};

export function CardPaymentModal({ statement, onClose, onPaid }: Props) {
  const { accounts: financialAccounts } = useFinancialAccounts();
  const { accounts: savingsAccounts } = useAccounts();

  const cashPayOptions = useMemo(() => {
    return financialAccounts
      .filter((a) => a.accountType === "cash" && a.savingsAccountId)
      .map((fa) => {
        const savings = savingsAccounts.find((s) => s.id === fa.savingsAccountId);
        return {
          financialAccountId: fa.id,
          name: fa.name,
          balance: savings?.balance ?? 0,
        };
      });
  }, [financialAccounts, savingsAccounts]);

  const statementDue =
    statement.minimumDue != null && statement.minimumDue > 0
      ? statement.minimumDue
      : statement.outstandingBalance;

  const pickDefaultAccount = useCallback(
    (options: typeof cashPayOptions, due: number) => {
      const withFunds = options.filter((o) => o.balance >= due - 0.01);
      if (withFunds.length > 0) return withFunds[0]!.financialAccountId;
      const anyBalance = options.filter((o) => o.balance > 0);
      if (anyBalance.length > 0) return anyBalance[0]!.financialAccountId;
      return options[0]?.financialAccountId ?? "";
    },
    []
  );

  const [financialAccountId, setFinancialAccountId] = useState(() =>
    pickDefaultAccount(cashPayOptions, statementDue)
  );
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const selectedCash = cashPayOptions.find((o) => o.financialAccountId === financialAccountId);
  const cashAvailable = selectedCash?.balance ?? 0;
  const maxPay = Math.min(
    statement.outstandingBalance,
    Math.max(0, cashAvailable)
  );

  useEffect(() => {
    if (!cashPayOptions.length) {
      setFinancialAccountId("");
      setAmount("0");
      return;
    }
    const accountId = pickDefaultAccount(cashPayOptions, statementDue);
    setFinancialAccountId(accountId);
    const acct = cashPayOptions.find((o) => o.financialAccountId === accountId);
    const pay = Math.min(statementDue, acct?.balance ?? 0, statement.outstandingBalance);
    setAmount(String(roundMoney(Math.max(0, pay))));
    console.info("[CardPaymentModal] defaults", {
      accountId,
      pay,
      cashAvailable: acct?.balance,
      statementDue,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when modal opens or balances change
  }, [statement.id, cashPayOptions.map((o) => `${o.financialAccountId}:${o.balance}`).join("|")]);

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
    if (amt > cashAvailable + 0.01) {
      setMsg(
        `Insufficient balance in ${selectedCash?.name ?? "account"}. Available ${fmt2(cashAvailable)}.`
      );
      return;
    }
    if (amt > statement.outstandingBalance + 0.01) {
      setMsg(`Payment cannot exceed statement outstanding (${fmt2(statement.outstandingBalance)}).`);
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/credit-cards/statements/${statement.id}/pay`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amt, financialAccountId }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Payment failed");
      console.info("[CardPaymentModal] payment ok", { statementId: statement.id, amt });
      dispatchDomainEvent([
        "expense:changed",
        "cards:changed",
        "accounts:changed",
        "savings:changed",
        "otherLoans:changed",
      ]);
      await onPaid();
      onClose();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Payment failed");
      console.error("[CardPaymentModal] payment failed", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="card modal-panel">
        <h3>Record card payment</h3>
        <p className="note">
          {statement.cardName} · statement {fmtCardDate(statement.statementCloseDate)} ·
          outstanding {fmt2(statement.outstandingBalance)}
        </p>
        <form onSubmit={(e) => void submit(e)}>
          <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0 }}>
            <label>
              Amount (SGD)
              <DecimalTextInput
                value={amount}
                onChange={setAmount}
                required
                disabled={saving}
              />
            </label>
            <label>
              Pay from (cash)
              <select
                value={financialAccountId}
                onChange={(e) => setFinancialAccountId(e.target.value)}
                required
                disabled={saving || cashPayOptions.length === 0}
              >
                <option value="">— Select —</option>
                {cashPayOptions.map((o) => (
                  <option key={o.financialAccountId} value={o.financialAccountId}>
                    {o.name} · {fmt2(o.balance)} available
                  </option>
                ))}
              </select>
            </label>
            {selectedCash ? (
              <p className="note" style={{ marginTop: 0 }}>
                Available {fmt2(cashAvailable)}
                {maxPay < statementDue
                  ? ` — max payment from this account: ${fmt2(maxPay)}`
                  : null}
              </p>
            ) : cashPayOptions.length === 0 ? (
              <p className="note" style={{ color: "var(--rust)" }}>
                No cash accounts with a linked savings balance. Add one under Cash accounts.
              </p>
            ) : null}
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
