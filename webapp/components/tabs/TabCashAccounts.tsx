"use client";

import { useEffect, useState } from "react";
import type { DashboardState, SavingsAccount } from "@/lib/types";
import type { AccountsBundle, SavingsGoal, SavingsSnapshot, UserSavingsAccount } from "@/lib/savings/types";
import {
  cashAccountsTotal,
  defaultSavingsAccount,
  localAccountTotals,
  netWorthSlices,
  netWorthTotal,
  wealthSummary,
} from "@/lib/finance";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { DecimalInput } from "@/components/DecimalInput";
import { ChartBox } from "@/components/ChartBox";
import { AccountLedgerModal } from "@/components/savings/AccountLedgerModal";

type CloudAccountsApi = {
  accounts: UserSavingsAccount[];
  totals: AccountsBundle["totals"] | null;
  saveAccounts: (accounts: UserSavingsAccount[]) => Promise<void>;
  recordAccountTransaction: (
    accountId: string,
    payload: {
      amount: number;
      occurredAt?: string;
      kind?: "deposit" | "withdrawal" | "adjustment";
      note?: string;
      goalId?: string;
      incomeCategoryId?: string;
    }
  ) => Promise<void>;
  reload: () => Promise<void>;
};

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  savings?: SavingsSnapshot | null;
  accountsApi?: CloudAccountsApi;
  savingsGoals?: SavingsGoal[];
};

export function TabCashAccounts({
  state: S,
  setState,
  savings,
  accountsApi,
  savingsGoals = [],
}: Props) {
  const [includeCpf, setIncludeCpf] = useState(false);
  const [editingAccounts, setEditingAccounts] = useState(false);
  const [cloudDraft, setCloudDraft] = useState<UserSavingsAccount[]>([]);
  const [accountsSaving, setAccountsSaving] = useState(false);
  const [accountsMsg, setAccountsMsg] = useState("");
  const [txRefresh, setTxRefresh] = useState(0);
  const [ledgerAccountId, setLedgerAccountId] = useState<string | null>(null);
  const useCloudAccounts = Boolean(accountsApi);

  const personalOnlySavings = savings
    ? {
        ...savings,
        jointCash: 0,
        jointNetWorthCash: 0,
        jointSavingsCash: 0,
        jointMonthlySave: 0,
      }
    : null;
  const { liab, lnw } = wealthSummary(S, personalOnlySavings);
  const totalNw = netWorthTotal(S, includeCpf, personalOnlySavings);
  const nwSlices = netWorthSlices(S, includeCpf, personalOnlySavings);

  const cashTotal = useCloudAccounts
    ? (accountsApi?.totals?.personalNetWorthCash ?? 0)
    : cashAccountsTotal(S);
  const savingsCashTotal = useCloudAccounts
    ? (accountsApi?.totals?.personalSavingsCash ?? 0)
    : localAccountTotals(S).personalSavingsCash;

  const ledgerAccount =
    ledgerAccountId && accountsApi
      ? (accountsApi.accounts.find((x) => x.id === ledgerAccountId) ?? null)
      : null;

  useEffect(() => {
    if (editingAccounts && accountsApi) {
      setCloudDraft(accountsApi.accounts);
    }
  }, [editingAccounts, accountsApi?.accounts]);

  const updateAccount = (i: number, patchAccount: Partial<SavingsAccount>) => {
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a, j) => (j === i ? { ...a, ...patchAccount } : a)),
    }));
    console.log("[TabCashAccounts] updated account", i, patchAccount);
  };

  const addAccount = () => {
    setState((prev) => ({
      ...prev,
      accounts: [...prev.accounts, defaultSavingsAccount()],
    }));
    console.log("[TabCashAccounts] added savings account");
  };

  const removeAccount = (i: number) => {
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((_, j) => j !== i),
    }));
    console.log("[TabCashAccounts] removed account", i);
  };

  return (
    <section className="panel on">
      <h2>Net worth</h2>
      <div className="card net-worth-card" style={{ marginBottom: 16 }}>
        <label className="ctrl">
          <input
            type="checkbox"
            checked={includeCpf}
            onChange={(e) => {
              setIncludeCpf(e.target.checked);
              console.log("[TabCashAccounts] include CPF", e.target.checked);
            }}
          />
          Include CPF in total net worth
        </label>
        <div className="net-worth-total">
          <div className="lbl">Total net worth</div>
          <div className="val">{fmt(totalNw)}</div>
          <div className="note">
            {includeCpf ? "Includes CPF" : "Excludes CPF"} · liquid {fmt(lnw)} · debt deducted (
            {fmt(liab)})
          </div>
        </div>
        {nwSlices.length > 0 ? (
          <ChartBox
            type="pie"
            height={280}
            data={{
              labels: nwSlices.map((s) => s.label),
              datasets: [
                {
                  data: nwSlices.map((s) => s.value),
                  backgroundColor: nwSlices.map((s) => s.color),
                  borderWidth: 2,
                  borderColor: "#faf7ef",
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: true,
                  position: "bottom",
                  labels: { boxWidth: 12, padding: 14 },
                },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const v = Number(ctx.raw);
                      const sum = nwSlices.reduce((s, x) => s + x.value, 0);
                      const pct = sum > 0 ? ((v / sum) * 100).toFixed(1) : "0";
                      return ` ${fmt(v)} (${pct}%)`;
                    },
                  },
                },
              },
            }}
          />
        ) : (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            Add holdings on Investment, cash accounts below, or CPF on CPF Outlook.
          </p>
        )}
      </div>

      <div className="section-head">
        <h2>Cash accounts</h2>
        {editingAccounts ? (
          <button
            type="button"
            className="btn sm"
            disabled={accountsSaving}
            onClick={() => {
              if (useCloudAccounts && accountsApi) {
                void (async () => {
                  setAccountsSaving(true);
                  setAccountsMsg("");
                  try {
                    await accountsApi.saveAccounts(cloudDraft);
                    setEditingAccounts(false);
                    console.log("[TabCashAccounts] cloud accounts saved");
                  } catch (e) {
                    setAccountsMsg(
                      e instanceof Error ? e.message : "Failed to save accounts"
                    );
                  } finally {
                    setAccountsSaving(false);
                  }
                })();
              } else {
                setEditingAccounts(false);
                console.log("[TabCashAccounts] accounts edit off");
              }
            }}
          >
            {accountsSaving ? "Saving…" : "Save"}
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setEditingAccounts(true);
              console.log("[TabCashAccounts] accounts edit on");
            }}
          >
            Edit
          </button>
        )}
      </div>
      {accountsMsg ? <p className="pin-error">{accountsMsg}</p> : null}
      <div className="card">
        {useCloudAccounts && accountsApi ? (
          <>
            {editingAccounts ? (
              <>
                {cloudDraft.length === 0 ? (
                  <p className="note">Add bank accounts or cash jars. Set opening balance on new rows only.</p>
                ) : null}
                {cloudDraft.map((a, i) => {
                  const isNew = !/^[0-9a-f-]{36}$/i.test(a.id);
                  return (
                    <div className="editrow accounts" key={a.id || i} style={{ marginBottom: 8 }}>
                      <input
                        type="text"
                        value={a.name}
                        placeholder="e.g. DBS savings"
                        onChange={(e) => {
                          const next = [...cloudDraft];
                          next[i] = { ...a, name: e.target.value };
                          setCloudDraft(next);
                        }}
                      />
                      {isNew ? (
                        <DecimalInput
                          value={a.balance}
                          step={0.01}
                          onChange={(v) => {
                            const next = [...cloudDraft];
                            next[i] = { ...a, balance: v };
                            setCloudDraft(next);
                          }}
                        />
                      ) : (
                        <span className="note" title="Use deposits below to change balance">
                          {fmt2(a.balance)}
                        </span>
                      )}
                      <input
                        type="text"
                        value={a.notes}
                        placeholder="Notes"
                        onChange={(e) => {
                          const next = [...cloudDraft];
                          next[i] = { ...a, notes: e.target.value };
                          setCloudDraft(next);
                        }}
                      />
                      <label className="ctrl" style={{ fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={a.includeInSavings}
                          onChange={(e) => {
                            const next = [...cloudDraft];
                            next[i] = { ...a, includeInSavings: e.target.checked };
                            setCloudDraft(next);
                          }}
                        />
                        Include in savings total
                      </label>
                      <button
                        type="button"
                        className="btn del sm"
                        onClick={() => setCloudDraft(cloudDraft.filter((_, j) => j !== i))}
                      >
                        del
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() =>
                    setCloudDraft([
                      ...cloudDraft,
                      {
                        id: `new-${cloudDraft.length}`,
                        userId: "",
                        name: "",
                        balance: 0,
                        notes: "",
                        sortOrder: cloudDraft.length,
                        includeInSavings: true,
                      },
                    ])
                  }
                >
                  + Add account
                </button>
              </>
            ) : accountsApi.accounts.length === 0 ? (
              <p className="note">No cash accounts yet. Click Edit to add one.</p>
            ) : (
              <>
                <div className="table-scroll">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th className="num">Balance</th>
                        <th>In savings?</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountsApi.accounts.map((a) => (
                        <tr
                          key={a.id}
                          className="ledger-row"
                          tabIndex={0}
                          role="button"
                          onClick={() => {
                            setLedgerAccountId(a.id);
                            console.info("[TabCashAccounts] opened account ledger", { id: a.id });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setLedgerAccountId(a.id);
                            }
                          }}
                        >
                          <td>
                            <strong>{a.name || "—"}</strong>
                          </td>
                          <td className="num">{fmt2(a.balance)}</td>
                          <td>
                            {a.includeInSavings ? "Yes" : "Total only"}
                          </td>
                          <td className="note" style={{ fontSize: 12 }}>
                            {a.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {ledgerAccount ? (
                  <AccountLedgerModal
                    account={ledgerAccount}
                    txRefresh={txRefresh}
                    goalOptions={savingsGoals
                      .filter((g) => g.scope === "individual")
                      .map((g) => ({ id: g.id, name: g.name }))}
                    onClose={() => setLedgerAccountId(null)}
                    onRecord={async (payload) => {
                      await accountsApi.recordAccountTransaction(
                        ledgerAccount.id,
                        payload
                      );
                      setTxRefresh((k) => k + 1);
                    }}
                  />
                ) : null}
              </>
            )}
          </>
        ) : editingAccounts ? (
          <>
            {S.accounts.length === 0 ? (
              <p style={{ color: "var(--muted)", fontStyle: "italic", marginBottom: 12 }}>
                No accounts yet. Add your bank, e-wallet, or cash jars.
              </p>
            ) : (
              <>
                <div className="editrow head accounts">
                  <span>Account</span>
                  <span>Balance</span>
                  <span>Notes</span>
                  <span>Savings?</span>
                  <span></span>
                </div>
                {S.accounts.map((a, i) => (
                  <div className="editrow accounts" key={i}>
                    <input
                      type="text"
                      value={a.name}
                      placeholder="e.g. DBS savings"
                      onChange={(e) => updateAccount(i, { name: e.target.value })}
                    />
                    <DecimalInput
                      value={a.balance}
                      step={0.01}
                      onChange={(v) => updateAccount(i, { balance: v })}
                    />
                    <input
                      type="text"
                      value={a.notes}
                      placeholder="Optional"
                      onChange={(e) => updateAccount(i, { notes: e.target.value })}
                    />
                    <label className="ctrl">
                      <input
                        type="checkbox"
                        checked={a.includeInSavings !== false}
                        onChange={(e) =>
                          updateAccount(i, { includeInSavings: e.target.checked })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="btn del sm"
                      onClick={() => removeAccount(i)}
                    >
                      del
                    </button>
                  </div>
                ))}
              </>
            )}
            <div className="toolbar">
              <button type="button" className="btn ghost sm" onClick={addAccount}>
                + Add account
              </button>
            </div>
          </>
        ) : S.accounts.length === 0 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            No cash accounts. Click <b>Edit</b> to add balances for net worth and savings.
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Balance</th>
                  <th>In savings?</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {S.accounts.map((a, i) => (
                  <tr key={i}>
                    <td>{a.name || "—"}</td>
                    <td className="num">{fmt2(a.balance)}</td>
                    <td>{a.includeInSavings !== false ? "Yes" : "Total only"}</td>
                    <td>{a.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="account-totals">
          <div className="account-totals-stat">
            <span className="account-totals-lbl">Total</span>
            <span className="account-totals-val">{fmt2(cashTotal)}</span>
          </div>
          <div className="account-totals-stat">
            <span className="account-totals-lbl">Savings</span>
            <span className="account-totals-val">{fmt2(savingsCashTotal)}</span>
          </div>
          {!editingAccounts ? (
            <p className="ui-hint account-totals-hint">
              {useCloudAccounts
                ? "All accounts count toward the total. Uncheck Include in savings to omit from Savings only."
                : "All accounts count toward the total. “In savings?” controls Savings rollup when signed in."}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
