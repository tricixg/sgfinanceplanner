import type { LoadErrors } from "@/lib/sync/explicit-delete";

/**
 * What the monthly net-worth snapshot is computed from. The snapshot is the
 * month's permanent record, so it must never be written from partial data:
 * a missing domain looks like "$0" and would silently understate (or
 * overstate) the figure.
 */
export type NetWorthSnapshotInputs = {
  /** Core domains still loading (profile, loans, other loans, cards, holdings). */
  coreLoading: boolean;
  /** Per-domain load failures from the app data provider. */
  loadErrors: LoadErrors;
  /** Cash accounts: loaded successfully (no error, not loading, totals present). */
  accountsLoaded: boolean;
  accountsError: string | null;
  /** Investment funds balance loaded successfully. */
  fundsLoaded: boolean;
  /** Card statements (open-cycle balances) loaded successfully. */
  cardStatementsLoaded: boolean;
};

/** Reasons the snapshot must not be written yet. Empty = safe to write. */
export function netWorthSnapshotBlockers(i: NetWorthSnapshotInputs): string[] {
  const out: string[] = [];
  if (i.coreLoading) out.push("core data still loading");
  for (const [domain, message] of Object.entries(i.loadErrors)) {
    if (message) out.push(`${domain} failed to load`);
  }
  if (i.accountsError) out.push("accounts failed to load");
  else if (!i.accountsLoaded) out.push("accounts not loaded");
  if (!i.fundsLoaded) out.push("funds not loaded");
  if (!i.cardStatementsLoaded) out.push("card statements not loaded");
  return out;
}
