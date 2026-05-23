import type { BTOInputs } from "./bto";

/** EHG tiers for first-timer families — BTO / resale (HDB, 2024–2026 policy). */
const EHG_FAMILY_TIERS: { maxIncome: number; grant: number }[] = [
  { maxIncome: 1500, grant: 80000 },
  { maxIncome: 2000, grant: 75000 },
  { maxIncome: 2500, grant: 70000 },
  { maxIncome: 3000, grant: 65000 },
  { maxIncome: 3500, grant: 60000 },
  { maxIncome: 4000, grant: 55000 },
  { maxIncome: 4500, grant: 50000 },
  { maxIncome: 5000, grant: 45000 },
  { maxIncome: 5500, grant: 40000 },
  { maxIncome: 6000, grant: 35000 },
  { maxIncome: 6500, grant: 30000 },
  { maxIncome: 7000, grant: 25000 },
  { maxIncome: 7500, grant: 20000 },
  { maxIncome: 8000, grant: 15000 },
  { maxIncome: 8500, grant: 10000 },
  { maxIncome: 9000, grant: 5000 },
];

export type BTOSchemeId =
  | "ehg"
  | "family"
  | "phg_with"
  | "phg_near"
  | "step_up";

export type BTOSchemeDef = {
  id: BTOSchemeId;
  name: string;
  appliesTo: "bto" | "resale" | "both";
  summary: string;
  eligibility: string;
  sourceUrl: string;
  /** Fixed grant when toggled; null = use compute(). */
  fixedAmount: number | null;
};

export const BTO_SCHEME_DEFS: BTOSchemeDef[] = [
  {
    id: "ehg",
    name: "Enhanced CPF Housing Grant (EHG)",
    appliesTo: "both",
    summary:
      "Main grant for first-timer families on BTO or resale. Credited to CPF OA to reduce loan and cash needed.",
    eligibility:
      "First-timer family; average household income ≤ $9,000/mo (assessed over 12 months at HFE application).",
    sourceUrl:
      "https://www.hdb.gov.sg/residential/buying-a-flat/new/cpf-housing-grants-for-bto-flats",
    fixedAmount: null,
  },
  {
    id: "family",
    name: "CPF Housing Grant (Family Grant)",
    appliesTo: "resale",
    summary:
      "Extra grant for first-timer families buying a resale flat (stackable with EHG). BTO buyers usually rely on EHG only.",
    eligibility:
      "First-timer family; resale flat; income ≤ $14,000/mo. Amount depends on flat size (e.g. $50k for 2–4 room).",
    sourceUrl:
      "https://www.hdb.gov.sg/residential/buying-a-flat/resale/cpf-housing-grants-for-resale-flats",
    fixedAmount: 50000,
  },
  {
    id: "phg_with",
    name: "Proximity Housing Grant — living with",
    appliesTo: "resale",
    summary: "For resale buyers who will live in the same flat with parents or children.",
    eligibility: "Resale purchase; live with parents/children in the flat.",
    sourceUrl:
      "https://www.hdb.gov.sg/residential/buying-a-flat/resale/cpf-housing-grants-for-resale-flats",
    fixedAmount: 30000,
  },
  {
    id: "phg_near",
    name: "Proximity Housing Grant — living near",
    appliesTo: "resale",
    summary: "For resale buyers within 4 km of parents’ or children’s flat.",
    eligibility: "Resale purchase; within 4 km of parents or married child.",
    sourceUrl:
      "https://www.hdb.gov.sg/residential/buying-a-flat/resale/cpf-housing-grants-for-resale-flats",
    fixedAmount: 20000,
  },
  {
    id: "step_up",
    name: "Step-Up CPF Housing Grant",
    appliesTo: "both",
    summary:
      "For families moving from public rental or a 2-room subsidised flat to a larger subsidised flat.",
    eligibility:
      "First-timer; currently in public rental or 2-room; buying 3-room or larger subsidised flat.",
    sourceUrl:
      "https://www.hdb.gov.sg/residential/buying-a-flat/new/cpf-housing-grants-for-bto-flats",
    fixedAmount: 15000,
  },
];

export type BTOSchemeSelection = Record<
  BTOSchemeId,
  { enabled: boolean; amountOverride: number | null }
>;

export function defaultBTOSchemes(): BTOSchemeSelection {
  return {
    ehg: { enabled: true, amountOverride: null },
    family: { enabled: false, amountOverride: null },
    phg_with: { enabled: false, amountOverride: null },
    phg_near: { enabled: false, amountOverride: null },
    step_up: { enabled: false, amountOverride: null },
  };
}

export function calcEhgFamilyGrant(householdIncomeMonthly: number): number {
  if (householdIncomeMonthly > 9000) return 0;
  for (const tier of EHG_FAMILY_TIERS) {
    if (householdIncomeMonthly <= tier.maxIncome) return tier.grant;
  }
  return 0;
}

export function schemeComputedAmount(
  id: BTOSchemeId,
  inputs: Pick<BTOInputs, "tSal" | "pSal">
): number {
  const def = BTO_SCHEME_DEFS.find((s) => s.id === id);
  if (!def) return 0;
  if (id === "ehg") {
    return calcEhgFamilyGrant(inputs.tSal + inputs.pSal);
  }
  return def.fixedAmount ?? 0;
}

export function schemeGrantAmount(
  id: BTOSchemeId,
  selection: BTOSchemeSelection,
  inputs: Pick<BTOInputs, "tSal" | "pSal">
): number {
  const sel = selection[id];
  if (!sel?.enabled) return 0;
  if (sel.amountOverride != null && sel.amountOverride >= 0) {
    return sel.amountOverride;
  }
  return schemeComputedAmount(id, inputs);
}

export function totalHousingGrants(
  selection: BTOSchemeSelection,
  inputs: Pick<BTOInputs, "tSal" | "pSal">
): number {
  return BTO_SCHEME_DEFS.reduce(
    (sum, def) => sum + schemeGrantAmount(def.id, selection, inputs),
    0
  );
}

export function enabledSchemeRows(
  selection: BTOSchemeSelection,
  inputs: Pick<BTOInputs, "tSal" | "pSal">
) {
  return BTO_SCHEME_DEFS.filter((def) => selection[def.id]?.enabled).map((def) => {
    const sel = selection[def.id];
    const amount = schemeGrantAmount(def.id, selection, inputs);
    const computed = schemeComputedAmount(def.id, inputs);
    const overridden =
      sel != null &&
      sel.amountOverride != null &&
      sel.amountOverride !== computed;
    return { ...def, amount, computed, overridden };
  });
}
