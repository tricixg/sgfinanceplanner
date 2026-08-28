"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardState, NetWorthSnapshot, SavingsAccount } from "@/lib/types";
import type { AccountsBundle, SavingsGoal, SavingsSnapshot, UserSavingsAccount } from "@/lib/savings/types";
import type { OpenCycleEstimate } from "@/lib/cards/types";
import {
  cashAccountsTotal,
  defaultSavingsAccount,
  localAccountTotals,
  netWorthSlices,
  wealthSummary,
  type LiabilityKey,
} from "@/lib/finance";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { DecimalInput, DecimalTextInput } from "@/components/DecimalInput";
import { ChartBox } from "@/components/ChartBox";
import { IncludeCheckbox } from "@/components/IncludeCheckbox";
import { AccountLedgerModal } from "@/components/savings/AccountLedgerModal";
import { NetWorthHistoryChart } from "@/components/savings/NetWorthHistoryChart";
import { sgtNowInputDateTime, sgtTodayYmd } from "@/lib/time/sgt";

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
  netWorthApi?: {
    history: NetWorthSnapshot[];
    appendSnapshot: (snap: NetWorthSnapshot) => Promise<void>;
  };
  openCycles?: OpenCycleEstimate[];
};

// Matches the persist-on-settle debounce in hooks/usePersistedState.ts.
const NET_WORTH_SNAPSHOT_DEBOUNCE_MS = 800;

const ALL_LIABILITIES_INCLUDED: Record<LiabilityKey, boolean> = {
  margin: true,
  instalmentLoans: true,
  personalLoans: true,
  btLoans: true,
  cardBalances: true,
};

export function TabCashAccounts({
  state: S,
  setState,
  savings,
  accountsApi,
  savingsGoals = [],
  netWorthApi,
  openCycles,
}: Props) {
  const [includeCpf, setIncludeCpf] = useState(false);
  const [liabIncluded, setLiabIncluded] = useState<Record<LiabilityKey, boolean>>(
    ALL_LIABILITIES_INCLUDED
  );
  const [liabilitiesOpen, setLiabilitiesOpen] = useState(false);
  const toggleLiabIncluded = (key: LiabilityKey) =>
    setLiabIncluded((p) => ({ ...p, [key]: !p[key] }));
  const [editingAccounts, setEditingAccounts] = useState(false);
  const [cloudDraft, setCloudDraft] = useState<UserSavingsAccount[]>([]);
  const [accountsSaving, setAccountsSaving] = useState(false);
  const [accountsMsg, setAccountsMsg] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferFromId, setTransferFromId] = useState("");
  const [transferToId, setTransferToId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDate, setTransferDate] = useState(() => sgtNowInputDateTime());
  const [transferNote, setTransferNote] = useState("");
  const [transferGoalId, setTransferGoalId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [txRefresh, setTxRefresh] = useState(0);
  const [ledgerAccountId, setLedgerAccountId] = useState<string | null>(null);
  const [showHiddenAccounts, setShowHiddenAccounts] = useState(false);
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
  const { invTotal, cash, liabLines, cpf, lnw: baselineLnw } = wealthSummary(
    S,
    personalOnlySavings,
    openCycles
  );
  const checkedLiab = liabLines.reduce(
    (sum, l) => sum + (liabIncluded[l.key] ? l.amount : 0),
    0
  );
  const lnw = invTotal + cash - checkedLiab;
  const totalNw = lnw + (includeCpf ? cpf : 0);
  const nwSlices = netWorthSlices(S, includeCpf, personalOnlySavings);

  const appendNwSnapshot = netWorthApi?.appendSnapshot;
  useEffect(() => {
    if (!appendNwSnapshot) return;
    // baselineLnw/cpf can settle across a few renders as savings/openCycles
    // resolve — debounce so one visit writes once, not once per intermediate
    // value, while still always writing the latest figure on genuine visits.
    const timer = setTimeout(() => {
      const month = `${sgtTodayYmd().slice(0, 7)}-01`;
      void appendNwSnapshot({ month, lnw: baselineLnw, cpf });
    }, NET_WORTH_SNAPSHOT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [appendNwSnapshot, baselineLnw, cpf]);

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

  const transferAccounts = useCloudAccounts ? accountsApi?.accounts ?? [] : [];
  const visibleAccounts = useCloudAccounts
    ? (accountsApi?.accounts ?? []).filter((a) => !a.hidden)
    : [];
  const hiddenAccountsCount = cloudDraft.filter((a) => a.hidden).length;
  const transferGoalOptions = savingsGoals
    .filter((g) => g.scope === "individual")
    .map((g) => ({ id: g.id, name: g.name }));

  const accountsBalanceKey = useMemo(
    () =>
      accountsApi?.accounts.map((a) => `${a.id}:${a.balance}`).join("|") ?? "",
    [accountsApi?.accounts]
  );

  useEffect(() => {
    if (!useCloudAccounts || !accountsBalanceKey) return;
    setTxRefresh((k) => k + 1);
  }, [useCloudAccounts, accountsBalanceKey]);

  useEffect(() => {
    if (editingAccounts && accountsApi) {
      setCloudDraft(accountsApi.accounts);
    }
  }, [editingAccounts, accountsApi]);

  const updateAccount = (i: number, patchAccount: Partial<SavingsAccount>) => {
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a, j) => (j === i ? { ...a, ...patchAccount } : a)),
    }));
    console.info("[TabCashAccounts] updated account", i, patchAccount);
  };

  const addAccount = () => {
    setState((prev) => ({
      ...prev,
      accounts: [...prev.accounts, defaultSavingsAccount()],
    }));
    console.info("[TabCashAccounts] added savings account");
  };

  const removeAccount = (i: number) => {
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((_, j) => j !== i),
    }));
    console.info("[TabCashAccounts] removed account", i);
  };

  const submitTransfer = async () => {
    if (!accountsApi) return;
    const amt = parseFloat(transferAmount);
    if (!transferFromId || !transferToId || transferFromId === transferToId) {
      setAccountsMsg("Choose different From and To accounts");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setAccountsMsg("Enter a valid transfer amount");
      return;
    }

    const fromName = transferAccounts.find((a) => a.id === transferFromId)?.name ?? "Account";
    const toName = transferAccounts.find((a) => a.id === transferToId)?.name ?? "Account";
    const when = new Date(transferDate).toISOString();
    const noteSuffix = transferNote.trim();
    setTransferring(true);
    setAccountsMsg("");
    try {
      await accountsApi.recordAccountTransaction(transferFromId, {
        amount: -amt,
        kind: "adjustment",
        occurredAt: when,
        note: noteSuffix
          ? `Transfer to ${toName} · ${noteSuffix}`
          : `Transfer to ${toName}`,
      });
      await accountsApi.recordAccountTransaction(transferToId, {
        amount: amt,
        kind: "adjustment",
        occurredAt: when,
        note: noteSuffix
          ? `Transfer from ${fromName} · ${noteSuffix}`
          : `Transfer from ${fromName}`,
        goalId: transferGoalId || undefined,
      });
      setTxRefresh((k) => k + 1);
      setTransferAmount("");
      setTransferNote("");
      setTransferGoalId("");
      setShowTransfer(false);
      console.info("[TabCashAccounts] transfer recorded", {
        from: transferFromId,
        to: transferToId,
        amount: amt,
        goalId: transferGoalId || undefined,
      });
    } catch (e) {
      setAccountsMsg(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setTransferring(false);
    }
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
              console.info("[TabCashAccounts] include CPF", e.target.checked);
            }}
          />
          Include CPF in total net worth
        </label>
        <button
          type="button"
          className="disclosure-toggle"
          onClick={() => setLiabilitiesOpen((v) => !v)}
          aria-expanded={liabilitiesOpen}
          style={{ marginTop: 8 }}
        >
          <span className="caret">{liabilitiesOpen ? "▾" : "▸"}</span>
          Liabilities · {fmt(checkedLiab)} deducted
        </button>
        {liabilitiesOpen ? (
          <div className="net-worth-liabilities" style={{ marginTop: 8, marginBottom: 4 }}>
            <table className="include-checkbox-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Liability</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {liabLines.map((line) => (
                  <tr
                    key={line.key}
                    className={
                      liabIncluded[line.key] ? undefined : "this-month-cashflow-row-excluded"
                    }
                  >
                    <td>
                      <IncludeCheckbox
                        checked={liabIncluded[line.key]}
                        onChange={() => toggleLiabIncluded(line.key)}
                        ariaLabel={`Include ${line.label} in net worth total`}
                      />
                    </td>
                    <td>{line.label}</td>
                    <td className="num">{fmt(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="net-worth-total" style={{ marginTop: 12 }}>
          <div className="lbl">Total net worth</div>
          <div className="val">{fmt(totalNw)}</div>
          <div className="note">
            {includeCpf ? "Includes CPF" : "Excludes CPF"} · liquid {fmt(lnw)} · debt deducted (
            {fmt(checkedLiab)})
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

      <NetWorthHistoryChart history={netWorthApi?.history ?? []} includeCpf={includeCpf} />

      <div className="section-head">
        <h2>Cash accounts</h2>
        <div className="toolbar" style={{ marginTop: 0 }}>
          {useCloudAccounts && !editingAccounts && (accountsApi?.accounts.length ?? 0) >= 2 ? (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setShowTransfer((v) => !v)}
            >
              {showTransfer ? "Cancel transfer" : "Add transfer"}
            </button>
          ) : null}
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
                      console.info("[TabCashAccounts] cloud accounts saved");
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
                  console.info("[TabCashAccounts] accounts edit off");
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
                console.info("[TabCashAccounts] accounts edit on");
              }}
            >
              Edit
            </button>
          )}
        </div>
      </div>
      {accountsMsg ? <p className="pin-error">{accountsMsg}</p> : null}
      {useCloudAccounts && showTransfer && !editingAccounts ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="section-head" style={{ marginBottom: 8 }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Transfer between cash accounts</h3>
            <span className="note" style={{ fontSize: 11 }}>
              Records two adjustments (out/in), not cashflow. A chosen goal counts the
              incoming (To) side as a contribution.
            </span>
          </div>
          <div className="toolbar" style={{ flexWrap: "wrap", alignItems: "end" }}>
            <label className="ctrl">
              <span className="note">From</span>
              <select
                value={transferFromId}
                onChange={(e) => setTransferFromId(e.target.value)}
                disabled={transferring}
              >
                <option value="">Select</option>
                {transferAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ctrl">
              <span className="note">To</span>
              <select
                value={transferToId}
                onChange={(e) => setTransferToId(e.target.value)}
                disabled={transferring}
              >
                <option value="">Select</option>
                {transferAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ctrl">
              <span className="note">Amount</span>
              <DecimalTextInput
                value={transferAmount}
                onChange={setTransferAmount}
                placeholder="0.00"
                disabled={transferring}
              />
            </label>
            <label className="ctrl">
              <span className="note">When</span>
              <input
                type="datetime-local"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                disabled={transferring}
              />
            </label>
            <label className="ctrl" style={{ minWidth: 220 }}>
              <span className="note">Note (optional)</span>
              <input
                type="text"
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
                placeholder="e.g. Top up spending account"
                disabled={transferring}
              />
            </label>
            {transferGoalOptions.length > 0 ? (
              <label className="ctrl">
                <span className="note">Savings goal (optional)</span>
                <select
                  value={transferGoalId}
                  onChange={(e) => setTransferGoalId(e.target.value)}
                  disabled={transferring}
                >
                  <option value="">None — balance only</option>
                  {transferGoalOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name || "Goal"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              className="btn sm"
              disabled={transferring}
              onClick={() => void submitTransfer()}
            >
              {transferring ? "Transferring…" : "Transfer"}
            </button>
          </div>
        </div>
      ) : null}
      <div className="card">
        {useCloudAccounts && accountsApi ? (
          <>
            {editingAccounts ? (
              <>
                {cloudDraft.length === 0 ? (
                  <p className="note">Add bank accounts or cash jars. Set opening balance on new rows only.</p>
                ) : null}
                {hiddenAccountsCount > 0 && (
                  <button
                    type="button"
                    className="disclosure-toggle"
                    onClick={() => setShowHiddenAccounts((v) => !v)}
                    aria-expanded={showHiddenAccounts}
                    style={{ marginBottom: 8 }}
                  >
                    <span className="caret">{showHiddenAccounts ? "▾" : "▸"}</span>
                    {showHiddenAccounts ? "Hide" : "Show"} {hiddenAccountsCount} hidden account
                    {hiddenAccountsCount === 1 ? "" : "s"}
                  </button>
                )}
                {cloudDraft.map((a, i) => {
                  if (a.hidden && !showHiddenAccounts) return null;
                  const isNew = !/^[0-9a-f-]{36}$/i.test(a.id);
                  return (
                    <div
                      className="editrow accounts"
                      key={a.id || i}
                      style={{ marginBottom: 8, opacity: a.hidden ? 0.6 : undefined }}
                    >
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
                      {a.hidden ? (
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => {
                            const next = [...cloudDraft];
                            next[i] = { ...a, hidden: false };
                            setCloudDraft(next);
                          }}
                        >
                          Unhide
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn del sm"
                          onClick={() => {
                            const next = [...cloudDraft];
                            next[i] = { ...a, hidden: true };
                            setCloudDraft(next);
                          }}
                        >
                          Hide
                        </button>
                      )}
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
                        hidden: false,
                      },
                    ])
                  }
                >
                  + Add account
                </button>
              </>
            ) : visibleAccounts.length === 0 ? (
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
                      {visibleAccounts.map((a) => (
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
