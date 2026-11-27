import { describe, expect, it } from "vitest";
import {
  expiryDateLabel,
  monthFromYmd,
  monthIndex,
  monthLabel,
  monthToYmd,
  quarterEnd,
  quarterLabel,
} from "@/lib/miles/months";
import { MILES_PROGRAMS, convertibleMiles, type MilesProgram } from "@/lib/miles/programs";
import {
  averageMonthlyEarn,
  balancesAt,
  buildTodos,
  cardSummary,
  flightInsights,
  simulateMiles,
  uobBalancePreview,
} from "@/lib/miles/plan";
import type { MilesLot } from "@/lib/miles/types";

const M = monthIndex;
const NOW = M(2026, 11);
const END = M(2030, 3);

let seq = 0;
function lot(program: MilesProgram, amount: number, earned: number | null, expiry?: number | null, extra: Partial<MilesLot> = {}): MilesLot {
  const rule = MILES_PROGRAMS[program];
  return {
    id: `lot-${++seq}`,
    program,
    earnedMonth: earned,
    expiryMonth: expiry !== undefined ? expiry : earned !== null && rule.expiryFor ? rule.expiryFor(earned) : null,
    amount,
    used: 0,
    source: "earned",
    convertedFrom: null,
    note: "",
    loggedOn: null,
    ...extra,
  };
}

/** Example balances in round numbers, as of Nov 2026. */
function sampleLots(): MilesLot[] {
  return [
    lot("krisflyer", 1300, M(2025, 10)),
    lot("krisflyer", 50, M(2025, 12)),
    lot("krisflyer", 100, M(2026, 1)),
    lot("krisflyer", 150, M(2026, 2)),
    lot("krisflyer", 1000, M(2026, 7)),
    lot("krisflyer", 17000, M(2026, 9)),
    lot("dbs_womans_world", 2000, M(2025, 10)),
    lot("dbs_womans_world", 4700, M(2026, 1)),
    lot("dbs_womans_world", 900, M(2026, 4)),
    lot("dbs_womans_world", 4900, M(2026, 7), undefined, { id: "ww-sep27" }),
    lot("dbs_womans_world", 300, M(2026, 10)),
    lot("uob", 1500, M(2026, 7)),
    lot("uob", 3000, M(2026, 10)),
    lot("dbs_altitude", 17500, M(2026, 11)),
  ];
}

describe("months", () => {
  it("round-trips database dates and labels expiry as the last day", () => {
    expect(monthFromYmd("2026-11-01")).toBe(NOW);
    expect(monthToYmd(M(2029, 2))).toBe("2029-02-01");
    expect(expiryDateLabel(M(2029, 2))).toBe("28 Feb 2029");
    expect(monthLabel(NOW)).toBe("Nov 2026");
    expect(quarterLabel(M(2026, 11))).toBe("Oct–Dec 2026");
    expect(quarterEnd(M(2026, 7))).toBe(M(2026, 9));
  });

  it("applies each programme's expiry rule", () => {
    expect(MILES_PROGRAMS.krisflyer.expiryFor!(M(2025, 10))).toBe(M(2028, 10));
    expect(MILES_PROGRAMS.dbs_womans_world.expiryFor!(M(2025, 10))).toBe(M(2026, 12));
    expect(MILES_PROGRAMS.uob.expiryFor!(M(2026, 8))).toBe(M(2028, 9));
    expect(MILES_PROGRAMS.dbs_altitude.expiryFor).toBeNull();
    expect(convertibleMiles("uob", 4500)).toBe(0);
    expect(convertibleMiles("dbs_altitude", 17500)).toBe(30000);
  });
});

describe("simulateMiles with the sample balances", () => {
  const lots = sampleLots();
  const plan = simulateMiles(lots, { now: NOW, end: END, plan: true });
  const base = simulateMiles(lots, { now: NOW, end: END, plan: false });

  it("counts KrisFlyer miles plus whole card blocks as ready to redeem", () => {
    expect(balancesAt(lots, NOW)).toEqual({ krisflyer: 19600, dbs_womans_world: 12800, dbs_altitude: 17500, uob: 4500 });
    expect(plan.months[0].total).toBe(69600);
    expect(plan.months[0].byProgram).toEqual({ krisflyer: 19600, dbs_womans_world: 20000, dbs_altitude: 30000, uob: 0 });
  });

  it("converts Woman's World in Dec 2026 and flags what blocks can't cover", () => {
    const todos = buildTodos(plan, lots, NOW);
    expect(todos[0]).toEqual({
      kind: "convert", month: M(2026, 12), program: "dbs_womans_world",
      points: 10000, miles: 20000, fee: 27.25, due: 2000, newExpiry: M(2029, 12),
    });
    expect(todos).toContainEqual({ kind: "short", month: M(2027, 9), program: "dbs_womans_world", need: 2200, atRisk: 2500, leftover: 2800 });
    expect(todos).toContainEqual({ kind: "short", month: M(2028, 9), program: "uob", need: 500, atRisk: 1500, leftover: 4500 });
    expect(todos).toContainEqual({ kind: "kfExpiry", month: M(2028, 10), amount: 1300 });
    expect(todos.at(-1)).toEqual({ kind: "hold", program: "dbs_altitude", balance: 17500, blocks: 3, leftover: 2500 });
    expect(plan.fates["ww-sep27"]).toEqual({ converted: 2400, convertedAt: M(2026, 12), remaining: 2500 });
  });

  it("finds the peak, the target window and what never converting costs", () => {
    const ins = flightInsights(plan, base, 46000);
    expect(ins.peak).toBe(69600);
    expect([ins.peakFrom, ins.peakTo, ins.firstDrop]).toEqual([NOW, M(2028, 10), M(2028, 11)]);
    expect(ins.target).toEqual({ from: NOW, to: M(2029, 12), openEnded: false });
    expect(ins.neverConvertGap).toEqual({ miles: 20000, month: M(2027, 10), lossesFrom: M(2027, 4) });
    expect(flightInsights(plan, base, 200000).targetShortBy).toBe(200000 - 69600);
  });

  it("summarises each card's next block", () => {
    expect(cardSummary("dbs_womans_world", plan, lots, NOW)).toMatchObject({
      action: { kind: "convertBy", month: M(2026, 12) }, remainder: 2800, short: 2200,
      deadline: { month: M(2027, 9), atRisk: 2500 },
    });
    expect(cardSummary("uob", plan, lots, NOW)).toMatchObject({
      action: { kind: "reachBlock" }, short: 500, deadline: { month: M(2028, 9), atRisk: 1500 },
    });
    expect(cardSummary("dbs_altitude", plan, lots, NOW)).toMatchObject({
      action: { kind: "whenBooking" }, short: 2500, deadline: null, convertibleMiles: 30000,
    });
  });

  it("projected earning lets the leftover Woman's World points make a block", () => {
    const earning = simulateMiles(lots, { now: NOW, end: END, plan: true, earnPerMonth: { dbs_womans_world: 900 } });
    expect(earning.events.find((e) => e.type === "short" && e.program === "dbs_womans_world")).toBeUndefined();
  });
});

describe("logging helpers", () => {
  const lots = sampleLots();

  it("dates a UOB balance increase to this quarter", () => {
    expect(uobBalancePreview(lots, 5200, NOW)).toEqual({ tracked: 4500, delta: 700, quarterFrom: M(2026, 10), expiry: M(2028, 12) });
  });

  it("averages the last 12 months of logged points", () => {
    expect(averageMonthlyEarn(lots, "dbs_womans_world", NOW)).toBe(900);
    expect(averageMonthlyEarn(lots, "uob", NOW)).toBe(380);
  });

  it("ignores used and expired points", () => {
    const used = [{ ...lots[0], used: 300 }, lot("krisflyer", 500, M(2023, 1))];
    expect(balancesAt(used, NOW).krisflyer).toBe(1000);
  });
});
