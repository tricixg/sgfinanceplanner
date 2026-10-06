export type Benefit = {
  id: string;
  userId: string;
  name: string;
  /** Null = no cap — usage is tracked but never compared against a limit. */
  limitAmount: number | null;
  /** Null = one-time allowance that never resets. Otherwise reset cadence in months (1 = monthly, 12 = annual, 24 = every 2 years). */
  cycleMonths: number | null;
  /** First cycle start (YYYY-MM-DD); later cycles repeat every cycleMonths from here. Freely editable. */
  cycleAnchorDate: string;
  incomeCategoryId: string | null;
  notes: string;
  sortOrder: number;
  hidden: boolean;
};

export type BenefitInput = {
  id?: string;
  name: string;
  limitAmount: number | null;
  cycleMonths: number | null;
  cycleAnchorDate: string;
  incomeCategoryId?: string | null;
  notes?: string;
  sortOrder?: number;
  hidden?: boolean;
};

export type BenefitClaim = {
  id: string;
  benefitId: string;
  amount: number;
  claimedAt: string;
  note: string;
  sourceRecordType: "savings" | "budget" | null;
  sourceRecordId: string | null;
  createdAt: string;
};

export type PastCyclePeriod = {
  cycleStart: string;
  /** Exclusive end. */
  cycleEnd: string;
  usedInCycle: number;
  /** Newest first. */
  claims: BenefitClaim[];
};

export type BenefitUsage = Benefit & {
  /** Start of the cycle containing today (YYYY-MM-DD). */
  cycleStart: string;
  /** Exclusive end of the current cycle; null when the benefit never resets. */
  cycleEnd: string | null;
  usedInCycle: number;
  /** Null when the benefit has no limit. */
  remaining: number | null;
  /** All-time claimed, across every cycle — the figure that matters for one-time benefits. */
  totalClaimed: number;
  /** Claims within the cycle containing today, newest first (uncapped). */
  currentCycleClaims: BenefitClaim[];
  /** Past cycles with at least one claim, most-recent-first. Empty for one-time benefits or no prior history. */
  pastCycles: PastCyclePeriod[];
};
