/** Fired when savings account balances may have changed (ledger, expenses, etc.). */
export const ACCOUNTS_CHANGED_EVENT = "accounts-changed";

/** @deprecated TabNow listens for this; also triggers account reload. */
export const SAVINGS_LEDGER_RECORDED_EVENT = "savings-ledger-recorded";

export function dispatchAccountsChanged(
  source: string,
  detail?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  const payload = { source, ...detail };
  console.info("[accounts-events] dispatch", payload);
  window.dispatchEvent(new CustomEvent(ACCOUNTS_CHANGED_EVENT, { detail: payload }));
}
