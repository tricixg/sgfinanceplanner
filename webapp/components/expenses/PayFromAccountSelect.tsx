"use client";

import { useEffect } from "react";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";

type Props = {
  value: string;
  onChange: (financialAccountId: string) => void;
  /** When true, empty selection is allowed (budget-only tracking). */
  optional?: boolean;
};

export function PayFromAccountSelect({ value, onChange, optional = false }: Props) {
  const { accounts, loading, configured } = useFinancialAccounts();

  useEffect(() => {
    if (!value && accounts.length > 0) {
      onChange(accounts[0].id);
      console.info("[PayFromAccountSelect] default account", { id: accounts[0].id });
    }
  }, [accounts, value, onChange]);

  if (!configured) {
    return (
      <p className="note" style={{ margin: 0 }}>
        Sign in to choose a pay-from account.
      </p>
    );
  }

  if (loading) {
    return <p className="note" style={{ margin: 0 }}>Loading accounts…</p>;
  }

  if (accounts.length === 0) {
    return (
      <p className="note" style={{ margin: 0 }}>
        No accounts yet. Add cash on <b>ME</b> or credit cards on <b>Credit Cards</b>, then
        refresh this page.
      </p>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Pay from account"
      required={!optional}
    >
      {optional ? <option value="">Pay from (optional)…</option> : null}
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} ({a.accountType === "credit_card" ? "card" : "cash"})
        </option>
      ))}
    </select>
  );
}
