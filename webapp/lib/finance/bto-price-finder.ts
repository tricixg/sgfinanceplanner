import { computeBTO, type BTOInputs } from "./bto";

/**
 * How a flat price sits against the household's CPF and cash, strictest first:
 * - "cpf": CPF OA covers AFL and key collection on the estimated dates
 * - "cpf-late": AFL covered, and OA catches up with the KC bill by the latest key date
 * - "cash": the cash top-ups (option fee + AFL + KC gaps) fit within cash savings
 * - "stretch": none of the above
 * Every zone but "stretch" also needs the OA inflow to cover the monthly mortgage.
 */
export type BtoAffordabilityZone = "cpf" | "cpf-late" | "cash" | "stretch";

export const BTO_ZONE_ORDER: BtoAffordabilityZone[] = ["cpf", "cpf-late", "cash", "stretch"];

type BTOResult = ReturnType<typeof computeBTO>;

export function btoAffordabilityZone(b: BTOResult, cashSavings: number): BtoAffordabilityZone {
  if (!b.mortOK) return "stretch";
  if (b.cashAFL <= 0 && b.cashKC <= 0) return "cpf";
  if (b.cashAFL <= 0 && b.latestKcOK) return "cpf-late";
  if (b.totalCash <= cashSavings) return "cash";
  return "stretch";
}

export type BtoPriceBands = {
  /** One row per price step, in ascending price order. */
  grid: { price: number; zone: BtoAffordabilityZone }[];
  /** Highest price in the range that lands in this zone or a stricter one; null if none. */
  maxPrice: Record<Exclude<BtoAffordabilityZone, "stretch">, number | null>;
};

/**
 * Sweeps the flat price across [min, max] and classifies each step — drives
 * the price finder's coloured ruler and "up to $X" figures. Everything except
 * the price comes from `base`, so the bands move as the inputs change.
 */
export function btoPriceBands(
  base: Omit<BTOInputs, "price">,
  cashSavings: number,
  range: { min: number; max: number; step: number }
): BtoPriceBands {
  const grid: BtoPriceBands["grid"] = [];
  for (let price = range.min; price <= range.max; price += range.step) {
    grid.push({ price, zone: btoAffordabilityZone(computeBTO({ ...base, price }), cashSavings) });
  }
  const highestWithin = (zone: BtoAffordabilityZone) => {
    const limit = BTO_ZONE_ORDER.indexOf(zone);
    let best: number | null = null;
    for (const row of grid) {
      if (BTO_ZONE_ORDER.indexOf(row.zone) <= limit) best = row.price;
    }
    return best;
  };
  return {
    grid,
    maxPrice: {
      cpf: highestWithin("cpf"),
      "cpf-late": highestWithin("cpf-late"),
      cash: highestWithin("cash"),
    },
  };
}
