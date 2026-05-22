import type { DashboardState } from "@/lib/types";
import { currentYm } from "./helpers";

/** Blank slate — used for reset and when no saved data exists. */
export const EMPTY_STATE: DashboardState = {
  monthlySal: 0,
  comms: 0,
  salaryCreditDay: 0,
  fatty: 0,
  house: 0,
  manu: 0,
  varSpend: 0,
  eci: 0,
  tpd: 0,
  acc: 0,
  oa: 0,
  sa: 0,
  ma: 0,
  ilp: 0,
  moo: 0,
  margin: 0,
  cash: 0,
  ccDebt: 0,
  cashflowStartYm: "",
  holdings: [],
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

/** Sample data for unit tests only — not used for reset or initial load. */
export const DEFAULTS: DashboardState = {
  monthlySal: 6500,
  comms: 165,
  salaryCreditDay: 25,
  fatty: 1000,
  house: 600,
  manu: 300,
  varSpend: 1100,
  eci: 84.13,
  tpd: 54.98,
  acc: 24.72,
  oa: 26687.97,
  sa: 7390.51,
  ma: 9940.98,
  ilp: 8300.04,
  moo: 25185.5,
  margin: 3953.91,
  cash: 2000,
  ccDebt: 622.58,
  cashflowStartYm: "2026-06",
  holdings: [
    {
      name: "Centurion",
      ticker: "OU8",
      qty: 4000,
      price: 1.48,
      sector: "Accommodation assets",
    },
    {
      name: "ValueMax",
      ticker: "T6I",
      qty: 18500,
      price: 0.995,
      sector: "Pawnbroking & gold",
    },
    {
      name: "Oiltek",
      ticker: "HQU",
      qty: 200,
      price: 2.14,
      sector: "Palm-oil engineering",
    },
    {
      name: "Aspial Lifestyle",
      ticker: "5UF",
      qty: 1000,
      price: 0.43,
      sector: "Jewellery retail",
    },
  ],
  budget: [
    { cat: "Fatty (family)", amt: 1000, type: "fixed" },
    { cat: "Household", amt: 600, type: "fixed" },
    { cat: "Insurance + ILP", amt: 464, type: "fixed" },
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
    { name: "DBS Altitude", statementDay: 1, paymentDueDay: 21, statementAmount: 0 },
    { name: "MariBank Card", statementDay: 5, paymentDueDay: 25, statementAmount: 0 },
    { name: "WW Mastercard", statementDay: 10, paymentDueDay: 7, statementAmount: 622.58 },
  ],
};

type LegacySaved = Partial<DashboardState> & {
  newSal?: number;
  oldSal?: number;
  setup?: number;
};

export function mergeWithDefaults(saved: LegacySaved): DashboardState {
  const monthlySal = saved.monthlySal ?? saved.newSal ?? 0;
  const merged: DashboardState = {
    ...createEmptyState(),
    ...saved,
    monthlySal,
    salaryCreditDay: saved.salaryCreditDay ?? 0,
    cashflowStartYm: saved.cashflowStartYm ?? currentYm(),
    holdings: saved.holdings ?? [],
    budget: (saved.budget ?? []).map((b) => ({
      cat:
        typeof b.cat === "string"
          ? b.cat
          : String((b as { category?: string }).category ?? ""),
      amt: typeof b.amt === "number" ? b.amt : 0,
      type:
        b.type === "fixed" ||
        b.type === "spend" ||
        b.type === "save" ||
        b.type === "invest"
          ? b.type
          : "spend",
    })),
    goals: saved.goals ?? [],
    loans: saved.loans ?? [],
    creditCards: saved.creditCards ?? [],
  };
  console.log("[mergeWithDefaults] merged state", {
    monthlySal: merged.monthlySal,
    creditCards: merged.creditCards.length,
    loans: merged.loans.length,
  });
  return merged;
}
