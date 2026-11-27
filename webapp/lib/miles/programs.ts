import { quarterEnd, type MonthIndex } from "@/lib/miles/months";

export type MilesProgram = "krisflyer" | "dbs_womans_world" | "dbs_altitude" | "uob";
export type CardProgram = Exclude<MilesProgram, "krisflyer">;

export type ProgramRule = {
  key: MilesProgram;
  name: string;
  short: string;
  /** Unit shown next to amounts. */
  unit: string;
  /** KrisFlyer miles per point (1 for KrisFlyer itself). */
  ratio: number;
  /** Smallest conversion, in points (0 = not convertible). */
  block: number;
  /** Fee per conversion, S$. */
  fee: number;
  /** Plain-language validity rule. */
  rule: string;
  /** Lots are grouped by calendar quarter (shown as "Oct–Dec 2026"). */
  quarterly: boolean;
  /** Expiry month for points earned in `earned`; null = never expires. */
  expiryFor: ((earned: MonthIndex) => MonthIndex) | null;
};

/**
 * Programme rules (checked Nov 2026; DBS and UOB published terms).
 * Mirrored in supabase/migrations/078_miles_lots.sql (private.miles_card_rule).
 */
export const MILES_PROGRAMS: Record<MilesProgram, ProgramRule> = {
  krisflyer: {
    key: "krisflyer",
    name: "KrisFlyer",
    short: "KrisFlyer",
    unit: "miles",
    ratio: 1,
    block: 0,
    fee: 0,
    rule: "Expires 3 years from the month earned",
    quarterly: false,
    expiryFor: (e) => e + 36,
  },
  dbs_womans_world: {
    key: "dbs_womans_world",
    name: "DBS Woman’s World",
    short: "Woman’s World",
    unit: "DBS pts",
    ratio: 2,
    block: 5000,
    fee: 27.25,
    rule: "Expires 1 year after the quarter earned",
    quarterly: true,
    expiryFor: (e) => quarterEnd(e) + 12,
  },
  dbs_altitude: {
    key: "dbs_altitude",
    name: "DBS Altitude",
    short: "Altitude",
    unit: "DBS pts",
    ratio: 2,
    block: 5000,
    fee: 27.25,
    rule: "No expiry",
    quarterly: false,
    expiryFor: null,
  },
  uob: {
    key: "uob",
    name: "UOB UNI$",
    short: "UOB",
    unit: "UNI$",
    ratio: 2,
    block: 5000,
    fee: 27,
    rule: "Expires 2 years after the quarter earned",
    quarterly: true,
    expiryFor: (e) => quarterEnd(e) + 24,
  },
};

/** Display order. Also the stacking order of the charts (colour-checked in this order). */
export const PROGRAM_ORDER: MilesProgram[] = ["krisflyer", "dbs_womans_world", "dbs_altitude", "uob"];
export const CARD_PROGRAMS: CardProgram[] = ["dbs_womans_world", "dbs_altitude", "uob"];
/** Cards whose points expire, so the plan converts them before they do. */
export const EXPIRING_CARDS: CardProgram[] = ["dbs_womans_world", "uob"];

/** KrisFlyer miles from converting a given number of points in whole blocks. */
export function convertibleMiles(program: MilesProgram, points: number): number {
  const p = MILES_PROGRAMS[program];
  if (program === "krisflyer") return points;
  return Math.floor(points / p.block) * p.block * p.ratio;
}

export function isMilesProgram(v: unknown): v is MilesProgram {
  return typeof v === "string" && v in MILES_PROGRAMS;
}

export function isCardProgram(v: unknown): v is CardProgram {
  return isMilesProgram(v) && v !== "krisflyer";
}

/** CSS colour token for a programme's chart series. */
export const programColor = (p: MilesProgram): string => `var(--miles-${p.replace(/_/g, "-")})`;
