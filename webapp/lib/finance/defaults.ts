import type { DashboardState } from "@/lib/types";
import { defaultBudgetTemplate, migrateBudget } from "./budget";
import { migrateInsurancePolicies } from "./insurance";
import { migrateIlpPolicies } from "./ilp";
import { migrateAccounts } from "./accounts";
import { migrateHoldings } from "./wealth";
import { migrateCardLoanLinks } from "./card-linking";
import { normalizeCreditCard } from "./card-rewards";
import { getDummyEnrichment } from "./dummy-data";
import { currentYm } from "./helpers";

/** Blank slate — used for reset and when no saved data exists. */
export const EMPTY_STATE: DashboardState = {
  monthlySal: 0,
  comms: 0,
  salaryCreditDay: 0,
  insurancePolicies: [],
  accounts: [],
  oa: 0,
  sa: 0,
  ma: 0,
  ilpPolicies: [],
  moo: 0,
  margin: 0,
  cash: 0,
  ccDebt: 0,
  cashflowStartYm: "",
  holdings: [],
  portfolioHistory: [],
  budget: [],
  goals: [],
  loans: [],
  creditCards: [],
};

export function createEmptyState(): DashboardState {
  return {
    ...structuredClone(EMPTY_STATE),
    cashflowStartYm: currentYm(),
  };
}

/** Sample dashboard for demos / local testing — full data across all tabs. */
export function createDummyState(): DashboardState {
  const dummy = mergeWithDefaults({
    ...structuredClone(DEFAULTS),
    ...getDummyEnrichment(),
  });
  dummy.cashflowStartYm = currentYm();
  const linkedDummy = migrateCardLoanLinks({
    creditCards: dummy.creditCards.map((c) => normalizeCreditCard(c)),
    loans: dummy.loans,
  });
  dummy.creditCards = linkedDummy.creditCards;
  dummy.loans = linkedDummy.loans;
  console.log("[createDummyState] loaded full dummy dashboard", {
    monthlySal: dummy.monthlySal,
    creditCards: dummy.creditCards.length,
    loans: dummy.loans.length,
    holdings: dummy.holdings.length,
    portfolioHistory: dummy.portfolioHistory.length,
    btoPlanner: Boolean(dummy.btoPlanner),
  });
  return dummy;
}

/** Sample data for unit tests only — not used for reset or initial load. */
export const DEFAULTS: DashboardState = {
  monthlySal: 6500,
  comms: 165,
  salaryCreditDay: 25,
  insurancePolicies: [
    { name: "ECI", insurer: "", monthlyPremium: 84.13, notes: "" },
    { name: "ManuProtect TPD", insurer: "Manulife", monthlyPremium: 54.98, notes: "" },
    { name: "ReadyProtect PA", insurer: "", monthlyPremium: 24.72, notes: "" },
  ],
  accounts: [
    { name: "High-yield savings account", balance: 2000, notes: "" },
    { name: "Separate savings account", balance: 500, notes: "" },
  ],
  oa: 26687.97,
  sa: 7390.51,
  ma: 9940.98,
  ilpPolicies: [
    {
      insurer: "Manulife",
      planName: "ILP",
      policyNo: "",
      premiumType: "regular",
      loadingType: "front-end",
      monthlyPremium: 300,
      initialBonus: 0,
      accountValue: 8300.04,
      premiumAllocationPct: 100,
      lockInEndYm: "",
      policyStartYm: "2020-01",
      surrenderChargeEndYm: "",
      insuranceCover: 0,
      funds: "",
      freeFundSwitchesPerYear: 2,
      notes: "",
    },
  ],
  portfolioHistory: [],
  moo: 25185.5,
  margin: 3953.91,
  cash: 2000,
  ccDebt: 622.58,
  cashflowStartYm: "2026-06",
  holdings: [
    {
      name: "Centurion",
      ticker: "OU8",
      market: "SGX",
      qty: 4000,
      avgCost: 1.48,
      lastPrice: 1.48,
      sector: "Accommodation assets",
    },
    {
      name: "ValueMax",
      ticker: "T6I",
      market: "SGX",
      qty: 18500,
      avgCost: 0.995,
      lastPrice: 0.995,
      sector: "Pawnbroking & gold",
    },
    {
      name: "Oiltek",
      ticker: "HQU",
      market: "SGX",
      qty: 200,
      avgCost: 2.14,
      lastPrice: 2.14,
      sector: "Palm-oil engineering",
    },
    {
      name: "Aspial Lifestyle",
      ticker: "5UF",
      market: "SGX",
      qty: 1000,
      avgCost: 0.43,
      lastPrice: 0.43,
      sector: "Jewellery retail",
    },
  ],
  budget: [
    { cat: "Fatty (family)", amt: 1000, type: "fixed" },
    { cat: "Household", amt: 600, type: "fixed" },
    { cat: "Living & variable spend", amt: 1100, type: "spend" },
    { cat: "Emergency / cash savings", amt: 900, type: "save" },
    { cat: "Investing", amt: 1300, type: "invest" },
  ],
  goals: [
    {
      name: "Emergency fund (6 months)",
      target: 18000,
      saved: 2000,
      by: "2027-06",
      where: "High-yield savings account",
    },
    {
      name: "BTO downpayment & costs (cash portion)",
      target: 16000,
      saved: 0,
      by: "2027-03",
      where: "T-bills / SSB ladder",
    },
    {
      name: "Wedding / ROM",
      target: 20000,
      saved: 0,
      by: "2028-06",
      where: "SSB + fixed deposit",
    },
    {
      name: "Renovation & furnishing",
      target: 45000,
      saved: 0,
      by: "2030-06",
      where: "SSB ladder, shift to cash near keys",
    },
    {
      name: "Travel fund",
      target: 6000,
      saved: 500,
      by: "2027-01",
      where: "Separate savings account",
    },
  ],
  loans: [
    {
      name: "PPP 001 — Preferred Payment Plan",
      card: "Altitude",
      monthly: 161.51,
      out: 161.6,
      end: "2026-06",
    },
    {
      name: "PPP 004 — Preferred Payment Plan",
      card: "Altitude",
      monthly: 84.13,
      out: 925.52,
      end: "2027-04",
    },
    {
      name: "IL 12M — Instalment Loan",
      card: "Altitude",
      monthly: 170.63,
      out: 853.19,
      end: "2026-10",
    },
    {
      name: "IL 24M — Instalment Loan",
      card: "Altitude",
      monthly: 87.3,
      out: 1484.1,
      end: "2027-10",
    },
    {
      name: "Instant Loan 9M",
      card: "MariBank",
      monthly: 233.09,
      out: 233.09,
      end: "2026-06",
    },
    {
      name: "Instant Loan 12M",
      card: "MariBank",
      monthly: 94.9,
      out: 474.5,
      end: "2026-10",
    },
    {
      name: "Woman's World — Balance Transfer 0%",
      card: "WW Mastercard",
      monthly: 0,
      out: 622.58,
      end: "2026-07",
    },
  ],
  creditCards: [
    {
      name: "DBS Altitude Visa",
      statementDay: 1,
      paymentDueDay: 21,
      statementAmount: 0,
      catalogId: "dbs-altitude-visa",
      bank: "DBS",
      rewardType: "miles",
      rewardHeadline: "Up to 3 mpd on travel; 2 mpd overseas",
    },
    {
      name: "Mari Credit Card",
      statementDay: 5,
      paymentDueDay: 25,
      statementAmount: 0,
      catalogId: "maribank-card",
      bank: "MariBank",
      rewardType: "cashback",
      rewardHeadline: "1.5% unlimited cashback",
    },
    {
      name: "DBS Woman's World Mastercard",
      statementDay: 10,
      paymentDueDay: 7,
      statementAmount: 622.58,
      catalogId: "dbs-ww-mastercard",
      bank: "DBS",
      rewardType: "miles",
      rewardHeadline: "4 mpd on online spend (DBS Points → miles)",
    },
  ],
};

type LegacySaved = Partial<DashboardState> & {
  newSal?: number;
  oldSal?: number;
  setup?: number;
  fatty?: number;
  house?: number;
  manu?: number;
  varSpend?: number;
  monthlyExpenses?: { name: string; amt: number; kind?: string }[];
  ilp?: number;
  eci?: number;
  tpd?: number;
  acc?: number;
};

export function mergeWithDefaults(saved: LegacySaved): DashboardState {
  const monthlySal = saved.monthlySal ?? saved.newSal ?? 0;
  const normalizedCards = (saved.creditCards ?? []).map((c) => normalizeCreditCard(c));
  const linked = migrateCardLoanLinks({
    creditCards: normalizedCards,
    loans: saved.loans ?? [],
  });
  const merged: DashboardState = {
    ...createEmptyState(),
    ...saved,
    monthlySal,
    salaryCreditDay: saved.salaryCreditDay ?? 0,
    cashflowStartYm: saved.cashflowStartYm ?? currentYm(),
    holdings: migrateHoldings(saved),
    portfolioHistory: Array.isArray(saved.portfolioHistory)
      ? saved.portfolioHistory
      : [],
    budget: migrateBudget(saved),
    goals: saved.goals ?? [],
    loans: linked.loans,
    creditCards: linked.creditCards,
    ilpPolicies: migrateIlpPolicies(saved),
    insurancePolicies: migrateInsurancePolicies(saved),
    accounts: migrateAccounts(saved),
    btoPlanner: saved.btoPlanner,
  };
  console.log("[mergeWithDefaults] merged state", {
    monthlySal: merged.monthlySal,
    creditCards: merged.creditCards.length,
    loans: merged.loans.length,
  });
  return merged;
}
