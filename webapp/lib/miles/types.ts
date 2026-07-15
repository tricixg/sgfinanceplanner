export const MILE_PROGRAMS = [
  { key: "krisflyer", label: "KrisFlyer" },
  { key: "asiaMiles", label: "Asia Miles" },
  { key: "avios", label: "Avios" },
  { key: "enrich", label: "Enrich" },
] as const;

export type MileProgramKey = (typeof MILE_PROGRAMS)[number]["key"];

/** A bank/points-program balance (e.g. "DBS Points") — directly edited, not a ledger. */
export type MilesBalance = {
  id: string;
  userId: string;
  name: string;
  pointsBalance: number;
  /** Portion of the balance that expires on expiryDate, if tracked. */
  expiringAmount: number | null;
  expiryDate: string | null;
  /** Points required per 1 mile, keyed by program. Missing/0 = not tracked for that program. */
  rates: Partial<Record<MileProgramKey, number>>;
  notes: string;
  sortOrder: number;
};

export type MilesTotals = {
  milesByProgram: Record<MileProgramKey, number>;
  /** Count of balances with no rate set for that program (excluded from its total). */
  uncountedByProgram: Record<MileProgramKey, number>;
};

export type MilesBundle = {
  balances: MilesBalance[];
  totals: MilesTotals;
};

/** Persisted on user_finance_profile.miles_planner — goal + preferred display program. */
export type MilesPlannerPrefs = {
  goalMiles: number;
  displayProgram: MileProgramKey;
};
