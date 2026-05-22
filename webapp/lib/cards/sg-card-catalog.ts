/**
 * Curated Singapore credit card rewards (indicative).
 * Update CATALOG_AS_OF and entries when bank T&Cs change — not scraped at runtime.
 * Sources: bank product pages, MoneySense / SingSaver summaries (2025–2026).
 */

export type SpendCategory =
  | "general"
  | "dining"
  | "travel"
  | "online"
  | "groceries"
  | "petrol"
  | "foreign"
  | "contactless";

export type CardRewardType = "miles" | "cashback" | "hybrid";

export type CardRewardRule = {
  category: SpendCategory;
  earn: string;
  cap?: string;
  minSpend?: string;
  /** For spend advisor scoring */
  milesPerDollar?: number;
  cashbackPct?: number;
};

export type CardCatalogEntry = {
  id: string;
  bank: string;
  name: string;
  rewardType: CardRewardType;
  headline: string;
  rules: CardRewardRule[];
  notes?: string;
};

export const CATALOG_AS_OF = "2026-05";

export const SPEND_CATEGORY_LABELS: Record<SpendCategory, string> = {
  general: "General spend",
  dining: "Dining",
  travel: "Travel / hotels / flights",
  online: "Online shopping",
  groceries: "Groceries / supermarkets",
  petrol: "Petrol / transport",
  foreign: "Foreign currency",
  contactless: "Contactless / mobile pay",
};

const r = (
  category: SpendCategory,
  earn: string,
  opts?: Partial<CardRewardRule>
): CardRewardRule => ({ category, earn, ...opts });

const CATALOG: CardCatalogEntry[] = [
  // DBS
  {
    id: "dbs-altitude-visa",
    bank: "DBS",
    name: "DBS Altitude Visa",
    rewardType: "miles",
    headline: "Up to 3 mpd on travel; 2 mpd overseas",
    rules: [
      r("travel", "3 mpd (online flight/hotel)", { milesPerDollar: 3 }),
      r("foreign", "2 mpd overseas", { milesPerDollar: 2 }),
      r("online", "2 mpd online flight/hotel", { milesPerDollar: 2 }),
      r("general", "1.2 mpd local", { milesPerDollar: 1.2 }),
    ],
    notes: "Miles via DBS Points → KrisFlyer. FX fee applies overseas.",
  },
  {
    id: "dbs-yuu-visa",
    bank: "DBS",
    name: "DBS yuu Visa",
    rewardType: "hybrid",
    headline: "Up to ~18% at yuu merchants (with conditions)",
    rules: [
      r("groceries", "Up to 18% at yuu partners", {
        cashbackPct: 18,
        minSpend: "$800/mo + 4 merchants",
        cap: "$144/mo",
      }),
      r("general", "0.25% base elsewhere", { cashbackPct: 0.25 }),
    ],
    notes: "Oct 2025 T&Cs: min spend, merchant count, monthly cap. Miles via yuu app.",
  },
  {
    id: "dbs-live-fresh",
    bank: "DBS",
    name: "DBS Live Fresh",
    rewardType: "cashback",
    headline: "Up to 10% on online & eco categories",
    rules: [
      r("online", "5% online", { cashbackPct: 5, cap: "$20/mo category" }),
      r("contactless", "5% contactless", { cashbackPct: 5, cap: "$20/mo" }),
      r("general", "0.3% all spend", { cashbackPct: 0.3 }),
    ],
  },
  {
    id: "dbs-ww-mastercard",
    bank: "DBS",
    name: "DBS Woman's World Mastercard",
    rewardType: "miles",
    headline: "4 mpd on online spend (DBS Points → miles)",
    rules: [
      r("online", "4 mpd online (local & FCY online)", {
        milesPerDollar: 4,
        cap: "$1,000/mo bonus cap (Aug 2025)",
      }),
      r("foreign", "1.2 mpd offline overseas", { milesPerDollar: 1.2 }),
      r("general", "0.4 mpd offline local", { milesPerDollar: 0.4 }),
    ],
    notes:
      "DBS Points transfer 1:2 to KrisFlyer / Asia Miles etc. Excess online spend above cap earns 0.4 mpd.",
  },
  // UOB
  {
    id: "uob-prvi-miles",
    bank: "UOB",
    name: "UOB PRVI Miles",
    rewardType: "miles",
    headline: "4 mpd overseas; 1.4 mpd local",
    rules: [
      r("foreign", "4 mpd overseas", { milesPerDollar: 4 }),
      r("travel", "4 mpd hotels & flights (selected)", { milesPerDollar: 4 }),
      r("general", "1.4 mpd local", { milesPerDollar: 1.4 }),
    ],
  },
  {
    id: "uob-one-card",
    bank: "UOB",
    name: "UOB One Card",
    rewardType: "cashback",
    headline: "Up to 6% cashback (tiered spend)",
    rules: [
      r("general", "3.33–6% by monthly spend tier", {
        cashbackPct: 6,
        minSpend: "Tiered $500–$2k",
        cap: "Per tier cap",
      }),
      r("petrol", "Up to 7% at Shell", { cashbackPct: 7, cap: "$20/mo" }),
    ],
  },
  {
    id: "uob-ladys",
    bank: "UOB",
    name: "UOB Lady's Card",
    rewardType: "miles",
    headline: "6 mpd on chosen category (1 of 6)",
    rules: [
      r("dining", "6 mpd if dining chosen", { milesPerDollar: 6, cap: "$3k/mo" }),
      r("travel", "6 mpd if travel chosen", { milesPerDollar: 6, cap: "$3k/mo" }),
      r("online", "6 mpd if online chosen", { milesPerDollar: 6, cap: "$3k/mo" }),
      r("general", "0.4 mpd other", { milesPerDollar: 0.4 }),
    ],
    notes: "Pick 1 category per quarter.",
  },
  {
    id: "uob-evol",
    bank: "UOB",
    name: "UOB EVOL Card",
    rewardType: "cashback",
    headline: "8% on dining, shopping, transport",
    rules: [
      r("dining", "8% dining", { cashbackPct: 8, cap: "$60/mo" }),
      r("online", "8% online shopping", { cashbackPct: 8, cap: "$60/mo" }),
      r("petrol", "8% transport", { cashbackPct: 8, cap: "$60/mo" }),
      r("general", "0.3% other", { cashbackPct: 0.3 }),
    ],
  },
  // OCBC
  {
    id: "ocbc-90n",
    bank: "OCBC",
    name: "OCBC 90°N Card",
    rewardType: "miles",
    headline: "4 mpd overseas; 1.3 mpd local",
    rules: [
      r("foreign", "4 mpd overseas", { milesPerDollar: 4 }),
      r("general", "1.3 mpd local", { milesPerDollar: 1.3 }),
    ],
  },
  {
    id: "ocbc-voyage",
    bank: "OCBC",
    name: "OCBC VOYAGE Card",
    rewardType: "miles",
    headline: "2.2 mpd local; 3 mpd overseas",
    rules: [
      r("foreign", "3 mpd overseas", { milesPerDollar: 3 }),
      r("general", "2.2 mpd local", { milesPerDollar: 2.2 }),
    ],
  },
  {
    id: "ocbc-frank",
    bank: "OCBC",
    name: "OCBC FRANK Card",
    rewardType: "cashback",
    headline: "8% on 2 chosen categories",
    rules: [
      r("online", "8% if category selected", { cashbackPct: 8, cap: "$25/mo each" }),
      r("dining", "8% if category selected", { cashbackPct: 8, cap: "$25/mo each" }),
      r("general", "0.2% other", { cashbackPct: 0.2 }),
    ],
  },
  {
    id: "ocbc-365",
    bank: "OCBC",
    name: "OCBC 365 Card",
    rewardType: "cashback",
    headline: "3–6% on essentials (dining, groceries, petrol)",
    rules: [
      r("dining", "6% dining", { cashbackPct: 6, cap: "$80/mo", minSpend: "$800" }),
      r("groceries", "3% groceries", { cashbackPct: 3, cap: "$80/mo", minSpend: "$800" }),
      r("petrol", "3% petrol", { cashbackPct: 3, cap: "$80/mo", minSpend: "$800" }),
      r("general", "0.3% other", { cashbackPct: 0.3 }),
    ],
  },
  // Citibank
  {
    id: "citi-premiermiles",
    bank: "Citibank",
    name: "Citi PremierMiles",
    rewardType: "miles",
    headline: "1.2 mpd local; 2 mpd overseas",
    rules: [
      r("foreign", "2 mpd overseas", { milesPerDollar: 2 }),
      r("general", "1.2 mpd local", { milesPerDollar: 1.2 }),
    ],
  },
  {
    id: "citi-smrt",
    bank: "Citibank",
    name: "Citi SMRT Card",
    rewardType: "cashback",
    headline: "5.6% on groceries, transport, coffee",
    rules: [
      r("groceries", "5.6% groceries", { cashbackPct: 5.6, cap: "$80/mo" }),
      r("petrol", "5.6% transport", { cashbackPct: 5.6, cap: "$80/mo" }),
      r("general", "0.3% other", { cashbackPct: 0.3 }),
    ],
  },
  {
    id: "citi-rewards",
    bank: "Citibank",
    name: "Citi Rewards Card",
    rewardType: "hybrid",
    headline: "4 mpd on shoes, bags, clothes (online & in-store)",
    rules: [
      r("online", "4 mpd shopping", { milesPerDollar: 4, cap: "$4k/mo" }),
      r("general", "0.4 mpd other", { milesPerDollar: 0.4 }),
    ],
  },
  // HSBC
  {
    id: "hsbc-revolution",
    bank: "HSBC",
    name: "HSBC Revolution",
    rewardType: "miles",
    headline: "4 mpd on dining, shopping, online (cap)",
    rules: [
      r("dining", "4 mpd dining", { milesPerDollar: 4, cap: "$1k/mo" }),
      r("online", "4 mpd online", { milesPerDollar: 4, cap: "$1k/mo" }),
      r("general", "0.4 mpd other", { milesPerDollar: 0.4 }),
    ],
  },
  {
    id: "hsbc-travelone",
    bank: "HSBC",
    name: "HSBC TravelOne",
    rewardType: "miles",
    headline: "4 mpd travel; 2.4 mpd overseas",
    rules: [
      r("travel", "4 mpd travel", { milesPerDollar: 4 }),
      r("foreign", "2.4 mpd overseas", { milesPerDollar: 2.4 }),
      r("general", "1.2 mpd local", { milesPerDollar: 1.2 }),
    ],
  },
  // Standard Chartered
  {
    id: "sc-journey",
    bank: "Standard Chartered",
    name: "SC Journey Card",
    rewardType: "miles",
    headline: "3 mpd on travel & foreign; 1.2 mpd local",
    rules: [
      r("travel", "3 mpd travel", { milesPerDollar: 3 }),
      r("foreign", "3 mpd foreign", { milesPerDollar: 3 }),
      r("general", "1.2 mpd local", { milesPerDollar: 1.2 }),
    ],
  },
  {
    id: "sc-simply-cash",
    bank: "Standard Chartered",
    name: "SC Simply Cash",
    rewardType: "cashback",
    headline: "1.5% unlimited cashback",
    rules: [r("general", "1.5% all spend", { cashbackPct: 1.5 })],
  },
  // AMEX
  {
    id: "amex-krisflyer",
    bank: "AMEX",
    name: "AMEX KrisFlyer Card",
    rewardType: "miles",
    headline: "1.4 mpd on SIA/KrisShop; 1 mpd other",
    rules: [
      r("travel", "1.4 mpd SIA & KrisShop", { milesPerDollar: 1.4 }),
      r("general", "1 mpd other", { milesPerDollar: 1 }),
    ],
  },
  {
    id: "amex-highflyer",
    bank: "AMEX",
    name: "AMEX HighFlyer Card",
    rewardType: "miles",
    headline: "1.8 mpd on SIA; 1.2 mpd other",
    rules: [
      r("travel", "1.8 mpd SIA spend", { milesPerDollar: 1.8 }),
      r("general", "1.2 mpd other", { milesPerDollar: 1.2 }),
    ],
  },
  // MariBank & Trust
  {
    id: "maribank-card",
    bank: "MariBank",
    name: "Mari Credit Card",
    rewardType: "cashback",
    headline: "1.5% unlimited cashback",
    rules: [r("general", "1.5% all spend", { cashbackPct: 1.5 })],
  },
  {
    id: "trust-card",
    bank: "Trust",
    name: "Trust Credit Card",
    rewardType: "cashback",
    headline: "1% unlimited; up to 22% at partners",
    rules: [
      r("general", "1% unlimited", { cashbackPct: 1 }),
      r("online", "Up to 22% at selected partners", {
        cashbackPct: 22,
        cap: "Partner limits",
      }),
    ],
  },
  // Maybank (popular miles entry)
  {
    id: "maybank-horizon",
    bank: "Maybank",
    name: "Maybank Horizon Visa",
    rewardType: "miles",
    headline: "2.8 mpd on travel, dining, foreign",
    rules: [
      r("travel", "2.8 mpd travel/dining/foreign", { milesPerDollar: 2.8 }),
      r("foreign", "2.8 mpd foreign", { milesPerDollar: 2.8 }),
      r("dining", "2.8 mpd dining", { milesPerDollar: 2.8 }),
      r("general", "0.4 mpd other", { milesPerDollar: 0.4 }),
    ],
  },
  // CIMB
  {
    id: "cimb-visa-signature",
    bank: "CIMB",
    name: "CIMB Visa Signature",
    rewardType: "cashback",
    headline: "8% on dining, online, groceries, petrol",
    rules: [
      r("dining", "8% dining", { cashbackPct: 8, cap: "$25/mo", minSpend: "$300" }),
      r("online", "8% online", { cashbackPct: 8, cap: "$25/mo", minSpend: "$300" }),
      r("groceries", "8% groceries", { cashbackPct: 8, cap: "$25/mo", minSpend: "$300" }),
      r("general", "0.2% other", { cashbackPct: 0.2 }),
    ],
  },
  // Bank of China
  {
    id: "boc-qoo10",
    bank: "BOC",
    name: "BOC Qoo10 Mastercard",
    rewardType: "cashback",
    headline: "Up to 10% on Qoo10; 3% dining",
    rules: [
      r("online", "10% Qoo10", { cashbackPct: 10, cap: "$50/mo" }),
      r("dining", "3% dining", { cashbackPct: 3 }),
      r("general", "0.3% other", { cashbackPct: 0.3 }),
    ],
  },
];

export const BANKS: string[] = [...new Set(CATALOG.map((c) => c.bank))].sort();

export const CARDS_BY_BANK: Record<string, CardCatalogEntry[]> = BANKS.reduce(
  (acc, bank) => {
    acc[bank] = CATALOG.filter((c) => c.bank === bank);
    return acc;
  },
  {} as Record<string, CardCatalogEntry[]>
);

const BY_ID = new Map(CATALOG.map((c) => [c.id, c]));

export function getCatalogEntry(id: string): CardCatalogEntry | undefined {
  return BY_ID.get(id);
}

export function cardsForBank(bank: string): CardCatalogEntry[] {
  return CARDS_BY_BANK[bank] ?? [];
}

export function findCatalogByName(name: string): CardCatalogEntry | undefined {
  const n = name.trim().toLowerCase();
  return CATALOG.find(
    (c) =>
      c.name.toLowerCase() === n ||
      c.name.toLowerCase().includes(n) ||
      n.includes(c.name.toLowerCase())
  );
}

export const ALL_CATALOG_IDS = CATALOG.map((c) => c.id);
