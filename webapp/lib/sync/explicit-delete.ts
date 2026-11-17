/**
 * Client-side helpers for "save the whole list" endpoints.
 *
 * The server never infers deletion from absence. The client sends the ids the
 * user removed: rows it had LOADED from the server that are no longer in the
 * edited list. A domain that failed to load has nothing loaded, so it can
 * never produce deletes (and editing is blocked anyway, see below).
 */
export function removedIds<T>(
  loaded: readonly T[],
  next: readonly T[],
  idOf: (item: T) => string | undefined
): string[] {
  const keep = new Set(next.map(idOf).filter((x): x is string => Boolean(x)));
  return loaded
    .map(idOf)
    .filter((id): id is string => Boolean(id) && !keep.has(id as string));
}

/**
 * Domains that can fail to load. loans/cards/holdings/accounts also block
 * editing (whole-list saves); profile and otherLoans are tracked so figures
 * derived from them (e.g. the monthly net-worth snapshot) are never recorded
 * from a failed load.
 */
export type GuardedDomain =
  | "loans"
  | "cards"
  | "holdings"
  | "accounts"
  | "profile"
  | "otherLoans";

export type LoadErrors = Partial<Record<GuardedDomain, string>>;

const LABELS: Record<GuardedDomain, string> = {
  loans: "instalment plans",
  cards: "credit cards",
  holdings: "holdings",
  accounts: "cash accounts",
  profile: "profile (CPF, margin, policies)",
  otherLoans: "personal and balance-transfer loans",
};

export function domainLabel(domain: GuardedDomain): string {
  return LABELS[domain];
}

export function isDomainEditable(errors: LoadErrors, domain: GuardedDomain): boolean {
  return !errors[domain];
}

/** Throws when the domain failed to load, so a save can never run on an empty/partial list. */
export function assertDomainEditable(errors: LoadErrors, domain: GuardedDomain): void {
  if (!isDomainEditable(errors, domain)) {
    throw new Error(
      `Couldn't load your ${domainLabel(domain)}, so editing is disabled to protect your data. Reload and try again.`
    );
  }
}
