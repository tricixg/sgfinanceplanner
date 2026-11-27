import type { MonthIndex } from "@/lib/miles/months";
import type { CardProgram, MilesProgram } from "@/lib/miles/programs";

export type { CardProgram, MilesProgram } from "@/lib/miles/programs";

export type MilesLotSource = "earned" | "balance_update" | "conversion";

/** One lot of miles or points: when it was earned, when it expires, how much is left. */
export type MilesLot = {
  id: string;
  program: MilesProgram;
  earnedMonth: MonthIndex | null;
  /** Usable to the end of this month; null = never expires. */
  expiryMonth: MonthIndex | null;
  amount: number;
  /** Converted or redeemed so far. */
  used: number;
  source: MilesLotSource;
  convertedFrom: CardProgram | null;
  note: string;
  /** YYYY-MM-DD the lot was logged (Altitude additions, UOB balance updates). */
  loggedOn: string | null;
};

export type MilesActivityKind = "convert" | "redeem";

/** A conversion (card points → KrisFlyer miles) or a redemption (miles spent). */
export type MilesActivity = {
  id: string;
  kind: MilesActivityKind;
  program: MilesProgram;
  month: MonthIndex;
  /** Points (convert) or miles (redeem) taken from the lots. */
  amount: number;
  miles: number;
  fee: number;
  description: string;
  createdLotId: string | null;
  createdAt: string;
};

export type MilesBundle = {
  lots: MilesLot[];
  activity: MilesActivity[];
};

export type TripType = "oneWay" | "return";

/** Persisted on user_finance_profile.miles_planner — chart settings for the Miles tab. */
export type MilesPlannerPrefs = {
  /** Index into KRISFLYER_SAVER_CHART. */
  targetTier: number;
  trip: TripType;
  /** Add projected monthly earning to the flight chart. */
  earnOn: boolean;
  /** Points/miles expected per month, per programme (null = use the logged average). */
  earnPerMonth: Partial<Record<MilesProgram, number>>;
};

export const avail = (lot: Pick<MilesLot, "amount" | "used">): number => lot.amount - lot.used;
