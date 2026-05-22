import type { DashboardState, IlpPolicy } from "@/lib/types";
import { migrateIlpValueHistory } from "./ilp-history";
import { currentYm, monIdx } from "./helpers";

export const COMPUTED_ILP_LABEL = "ILP premiums (from Investment)";

export function defaultIlpPolicy(): IlpPolicy {
  return {
    insurer: "",
    planName: "",
    policyNo: "",
    premiumType: "regular",
    loadingType: "front-end",
    monthlyPremium: 0,
    initialBonus: 0,
    accountValue: 0,
    premiumAllocationPct: 100,
    lockInEndYm: "",
    policyStartYm: currentYm(),
    surrenderChargeEndYm: "",
    insuranceCover: 0,
    funds: "",
    freeFundSwitchesPerYear: 2,
    notes: "",
    valueHistory: [],
  };
}

export function ilpTotalValue(S: DashboardState): number {
  return S.ilpPolicies.reduce((s, p) => s + p.accountValue, 0);
}

export type IlpValueSplit = {
  total: number;
  spendable: number;
  locked: number;
};

/** Split ILP account value by lock-in — locked balances are not spendable now. */
export function ilpValueByLock(
  S: DashboardState,
  nowYm = currentYm()
): IlpValueSplit {
  let spendable = 0;
  let locked = 0;
  for (const p of S.ilpPolicies) {
    const v = p.accountValue;
    if (lockInStatus(p, nowYm) === "locked") {
      locked += v;
    } else {
      spendable += v;
    }
  }
  return { total: spendable + locked, spendable, locked };
}

export function computedIlpMonthly(S: DashboardState): number {
  return S.ilpPolicies.reduce((s, p) => s + p.monthlyPremium, 0);
}

export function lockInLabel(policy: IlpPolicy, nowYm = currentYm()): string {
  if (!policy.lockInEndYm) return "—";
  const end = monIdx(policy.lockInEndYm);
  const now = monIdx(nowYm);
  if (end > now) {
    return `Locked until ${policy.lockInEndYm}`;
  }
  return "Lock-in ended";
}

export function lockInStatus(
  policy: IlpPolicy,
  nowYm = currentYm()
): "locked" | "free" | "unknown" {
  if (!policy.lockInEndYm) return "unknown";
  return monIdx(policy.lockInEndYm) > monIdx(nowYm) ? "locked" : "free";
}

type LegacyIlpSaved = {
  ilpPolicies?: Partial<IlpPolicy>[];
  ilp?: number;
  manu?: number;
};

function normalizePolicy(raw: Partial<IlpPolicy>): IlpPolicy {
  const base = defaultIlpPolicy();
  const merged: IlpPolicy = {
    ...base,
    ...raw,
    premiumType: raw.premiumType === "single" ? "single" : "regular",
    loadingType:
      raw.loadingType === "back-end" ||
      raw.loadingType === "single" ||
      raw.loadingType === "front-end"
        ? raw.loadingType
        : "front-end",
    monthlyPremium: typeof raw.monthlyPremium === "number" ? raw.monthlyPremium : 0,
    initialBonus: typeof raw.initialBonus === "number" ? raw.initialBonus : 0,
    accountValue: typeof raw.accountValue === "number" ? raw.accountValue : 0,
    premiumAllocationPct:
      typeof raw.premiumAllocationPct === "number" ? raw.premiumAllocationPct : 100,
    freeFundSwitchesPerYear:
      typeof raw.freeFundSwitchesPerYear === "number"
        ? raw.freeFundSwitchesPerYear
        : 2,
    valueHistory: Array.isArray(raw.valueHistory) ? raw.valueHistory : [],
  };
  return migrateIlpValueHistory(merged);
}

export function migrateIlpPolicies(saved: LegacyIlpSaved): IlpPolicy[] {
  if (saved.ilpPolicies?.length) {
    return saved.ilpPolicies.map((p) => normalizePolicy(p));
  }

  const legacyValue = saved.ilp ?? 0;
  const legacyPremium = saved.manu ?? 0;
  if (legacyValue <= 0 && legacyPremium <= 0) return [];

  return [
    normalizePolicy({
      insurer: "Manulife",
      planName: "ILP",
      monthlyPremium: legacyPremium,
      accountValue: legacyValue,
      loadingType: "front-end",
      premiumAllocationPct: 100,
      notes: "Migrated from legacy ILP value / Manulife premium fields",
    }),
  ];
}

/** Budget lines that duplicate computed ILP premiums — exclude on migrate. */
export function isIlpBudgetCategory(cat: string): boolean {
  const c = cat.toLowerCase();
  return (
    /\bilp\b/.test(c) ||
    c.includes("manulife ilp") ||
    c.includes("insurance + ilp")
  );
}
