import type { MileProgramKey } from "./types";

export type MilesBankPreset = {
  name: string;
  rates: Partial<Record<MileProgramKey, number>>;
};

/**
 * Starting points-per-mile rates, sourced from published bank transfer rates (Jul 2026).
 * Only KrisFlyer rates are pre-filled — Asia Miles/Avios/Enrich transfer ratios vary
 * and are left blank for the user to confirm against their bank's own chart.
 */
export const MILES_BANK_PRESETS: MilesBankPreset[] = [
  { name: "DBS Points", rates: { krisflyer: 0.5 } }, // 1 DBS Point = 2 miles
  { name: "UOB Points (UNI$)", rates: { krisflyer: 0.5 } }, // 1 UNI$ = 2 miles
  { name: "HSBC Points", rates: { krisflyer: 3 } }, // 30,000 points = 10,000 miles
  { name: "Max Miles", rates: { krisflyer: 1.2 } }, // ~1 Max Mile = 0.83 KrisFlyer mile
];
