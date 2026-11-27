import type { MilesPlannerPrefs, TripType } from "@/lib/miles/types";

export type RedemptionTier = {
  region: string;
  examples: string;
  cabin: "Economy" | "Business" | "First";
  milesOneWay: number;
};

/**
 * Approximate KrisFlyer Saver one-way award pricing from Singapore, reflecting the
 * award chart update effective Nov 2025. Actual pricing varies by exact route, date,
 * and award seat availability — use this as a rough planning guide only.
 */
const RAW_CHART: RedemptionTier[] = [
  { region: "Southeast Asia", examples: "Bangkok, KL, Bali, Manila", cabin: "Economy", milesOneWay: 10000 },
  { region: "South Asia", examples: "Mumbai, Delhi, Maldives", cabin: "Economy", milesOneWay: 19000 },
  { region: "North Asia", examples: "Tokyo, Seoul, Hong Kong, Taipei", cabin: "Economy", milesOneWay: 23000 },
  { region: "Southeast Asia", examples: "Bangkok, KL, Bali, Manila", cabin: "Business", milesOneWay: 23000 },
  { region: "Australia / NZ", examples: "Sydney, Melbourne, Auckland", cabin: "Economy", milesOneWay: 27000 },
  { region: "Europe", examples: "London, Paris, Frankfurt", cabin: "Economy", milesOneWay: 44000 },
  { region: "US (West Coast)", examples: "LA, San Francisco", cabin: "Economy", milesOneWay: 44000 },
  { region: "South Asia", examples: "Mumbai, Delhi, Maldives", cabin: "Business", milesOneWay: 45000 },
  { region: "North Asia", examples: "Tokyo, Seoul, Hong Kong, Taipei", cabin: "Business", milesOneWay: 50000 },
  { region: "Australia / NZ", examples: "Sydney, Melbourne, Auckland", cabin: "Business", milesOneWay: 72000 },
  { region: "North Asia", examples: "Tokyo, Seoul, Hong Kong, Taipei", cabin: "First", milesOneWay: 70000 },
  { region: "Europe", examples: "London, Paris, Frankfurt", cabin: "Business", milesOneWay: 108500 },
  { region: "US (West Coast)", examples: "LA, San Francisco", cabin: "Business", milesOneWay: 112500 },
  { region: "US (East Coast)", examples: "New York", cabin: "Business", milesOneWay: 117000 },
  { region: "Europe", examples: "London, Paris, Frankfurt", cabin: "First", milesOneWay: 148000 },
];

export const KRISFLYER_SAVER_CHART: RedemptionTier[] = [...RAW_CHART].sort(
  (a, b) => a.milesOneWay - b.milesOneWay
);

export function estimateRedemption(goalMiles: number): {
  achievable: RedemptionTier | null;
  next: RedemptionTier | null;
} {
  let achievable: RedemptionTier | null = null;
  let next: RedemptionTier | null = null;
  for (const tier of KRISFLYER_SAVER_CHART) {
    if (tier.milesOneWay <= goalMiles) {
      achievable = tier;
    } else {
      next = tier;
      break;
    }
  }
  return { achievable, next };
}

/** Default Miles tab settings: North Asia Economy, return, logged points only. */
export const DEFAULT_MILES_PREFS: MilesPlannerPrefs = {
  targetTier: Math.max(
    0,
    KRISFLYER_SAVER_CHART.findIndex((t) => t.region === "North Asia" && t.cabin === "Economy")
  ),
  trip: "return",
  earnOn: false,
  earnPerMonth: {},
};

export function awardTier(index: number): RedemptionTier {
  return KRISFLYER_SAVER_CHART[index] ?? KRISFLYER_SAVER_CHART[DEFAULT_MILES_PREFS.targetTier];
}

/** Miles needed for the chosen award. */
export function awardMiles(index: number, trip: TripType): number {
  return awardTier(index).milesOneWay * (trip === "return" ? 2 : 1);
}
