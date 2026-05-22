import { getCatalogEntry } from "@/lib/cards/sg-card-catalog";
import type {
  CreditCard,
  DashboardState,
  Holding,
  PortfolioSnapshot,
} from "@/lib/types";
import { addMonthsYm } from "./calendar";
import { applyCatalogEntry } from "./card-rewards";
import { currentYm } from "./helpers";
import { portfolioTotals, todayDateStr } from "./holdings";
import { defaultBtoPlannerPrefs } from "./bto";

function cardFromCatalog(
  id: string,
  billing: { statementDay: number; paymentDueDay: number; statementAmount: number }
): CreditCard {
  const entry = getCatalogEntry(id);
  const base = entry
    ? applyCatalogEntry(entry)
    : { name: id, bank: undefined, catalogId: id };
  return {
    name: base.name ?? id,
    statementDay: billing.statementDay,
    paymentDueDay: billing.paymentDueDay,
    statementAmount: billing.statementAmount,
    catalogId: base.catalogId,
    bank: base.bank,
    rewardType: base.rewardType,
    rewardHeadline: base.rewardHeadline,
    rewardRules: base.rewardRules,
  };
}

function buildPortfolioHistory(holdings: Holding[]): PortfolioSnapshot[] {
  const ym = currentYm();
  const totals = portfolioTotals(holdings);
  const snaps: PortfolioSnapshot[] = [];
  for (let i = 7; i >= 0; i--) {
    const monthYm = addMonthsYm(ym, -i);
    const growth = 0.88 + (7 - i) * 0.025;
    snaps.push({
      recordedAt: `${monthYm}-15`,
      totalValue: Math.round(totals.totalValue * growth * 100) / 100,
      totalCost: Math.round(totals.totalCost * growth * 0.97 * 100) / 100,
    });
  }
  return snaps;
}

const DUMMY_HOLDINGS: Holding[] = [
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
  {
    name: "NVIDIA",
    ticker: "NVDA",
    market: "US",
    qty: 15,
    avgCost: 145,
    lastPrice: 168,
    lastPriceAt: todayDateStr(),
    sector: "Semiconductors",
  },
  {
    name: "Apple",
    ticker: "AAPL",
    market: "US",
    qty: 20,
    avgCost: 198,
    lastPrice: 210,
    lastPriceAt: todayDateStr(),
    sector: "Technology",
  },
];

/** Extra fields merged onto DEFAULTS for “Add dummy data”. */
export function getDummyEnrichment(): Partial<DashboardState> {
  const ilpAccountValue = 8300.04;
  const holdings = DUMMY_HOLDINGS.map((h) => ({ ...h }));

  return {
    accounts: [
      { name: "DBS Multiplier (salary)", balance: 8500, notes: "Salary crediting account" },
      { name: "High-yield savings account", balance: 2000, notes: "Emergency buffer" },
      { name: "Separate savings account", balance: 500, notes: "Travel / short-term goals" },
      { name: "PayLah / cash float", balance: 320, notes: "Day-to-day spending" },
    ],
    insurancePolicies: [
      {
        name: "ECI",
        insurer: "AIA",
        monthlyPremium: 84.13,
        notes: "Early CI — flows to budget",
      },
      {
        name: "ManuProtect TPD",
        insurer: "Manulife",
        monthlyPremium: 54.98,
        notes: "Linked to Manulife ILP",
      },
      {
        name: "ReadyProtect PA",
        insurer: "NTUC Income",
        monthlyPremium: 24.72,
        notes: "Personal accident",
      },
    ],
    oa: 26687.97,
    sa: 7390.51,
    ma: 9940.98,
    moo: 25185.5,
    margin: 3953.91,
    cash: 11320,
    ccDebt: 622.58,
    holdings,
    portfolioHistory: buildPortfolioHistory(holdings),
    ilpPolicies: [
      {
        insurer: "Manulife",
        planName: "ManuInvest Growth",
        policyNo: "ILP-2020-001",
        premiumType: "regular",
        loadingType: "front-end",
        monthlyPremium: 300,
        initialBonus: 2400,
        accountValue: ilpAccountValue,
        premiumAllocationPct: 100,
        lockInEndYm: addMonthsYm(currentYm(), 24),
        policyStartYm: "2020-01",
        surrenderChargeEndYm: "2028-12",
        insuranceCover: 50000,
        funds: "Equity / balanced feeder funds",
        freeFundSwitchesPerYear: 2,
        notes: "Sample ILP — update value when statements arrive",
      },
    ],
    budget: [
      { cat: "Fatty (family)", amt: 1000, type: "fixed" },
      { cat: "Household", amt: 600, type: "fixed" },
      { cat: "Mobile & subscriptions", amt: 80, type: "fixed" },
      { cat: "Living & variable spend", amt: 1100, type: "spend" },
      { cat: "Transport", amt: 120, type: "spend" },
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
        saved: 2500,
        by: "2027-03",
        where: "T-bills / SSB ladder",
      },
      {
        name: "Wedding / ROM",
        target: 20000,
        saved: 1500,
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
        end: addMonthsYm(currentYm(), 1),
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
        end: addMonthsYm(currentYm(), 1),
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
      {
        name: "PPP 002 — Closed plan",
        card: "Altitude",
        monthly: 0,
        out: 0,
        end: addMonthsYm(currentYm(), -2),
      },
    ],
    creditCards: [
      cardFromCatalog("dbs-altitude-visa", {
        statementDay: 1,
        paymentDueDay: 21,
        statementAmount: 1842.5,
      }),
      cardFromCatalog("dbs-ww-mastercard", {
        statementDay: 10,
        paymentDueDay: 7,
        statementAmount: 622.58,
      }),
      cardFromCatalog("maribank-card", {
        statementDay: 5,
        paymentDueDay: 25,
        statementAmount: 412.0,
      }),
      cardFromCatalog("citi-smrt", {
        statementDay: 15,
        paymentDueDay: 5,
        statementAmount: 286.4,
      }),
      cardFromCatalog("uob-one-card", {
        statementDay: 20,
        paymentDueDay: 10,
        statementAmount: 0,
      }),
    ],
    btoPlanner: defaultBtoPlannerPrefs({
      monthlySal: 6500,
      oa: 26687.97,
    }),
  };
}
