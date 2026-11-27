import { quarterEnd, quarterStart, type MonthIndex } from "@/lib/miles/months";
import {
  CARD_PROGRAMS,
  EXPIRING_CARDS,
  MILES_PROGRAMS,
  PROGRAM_ORDER,
  convertibleMiles,
  type CardProgram,
  type MilesProgram,
} from "@/lib/miles/programs";
import { avail, type MilesLot } from "@/lib/miles/types";

export type EarnPerMonth = Partial<Record<MilesProgram, number>>;

export type PlanOptions = {
  now: MonthIndex;
  /** Last month to project (inclusive). */
  end: MonthIndex;
  /** true: convert expiring card points just before they expire (whole blocks, oldest first). */
  plan: boolean;
  /** Projected points per month from next month on; omit for logged points only. */
  earnPerMonth?: EarnPerMonth | null;
};

export type PlanMonth = {
  month: MonthIndex;
  /** KrisFlyer miles you could redeem this month, by where they came from. */
  byProgram: Record<MilesProgram, number>;
  cardBalance: Record<CardProgram, number>;
  /** Card points below a whole block (can't be converted yet). */
  stranded: Record<CardProgram, number>;
  total: number;
};

export type PlanEvent =
  | {
      type: "convert";
      month: MonthIndex;
      program: CardProgram;
      points: number;
      miles: number;
      fee: number;
      newExpiry: MonthIndex;
      /** Points expiring that month that the conversion saves. */
      due: number;
    }
  | {
      type: "short";
      month: MonthIndex;
      program: CardProgram;
      /** Points that will expire because they don't make a whole block. */
      atRisk: number;
      /** Points still to earn before `month` to make the next block. */
      need: number;
      leftover: number;
    }
  | {
      type: "expire";
      month: MonthIndex;
      /** Programme the points came from (KrisFlyer miles from a conversion keep the card). */
      program: MilesProgram;
      isMiles: boolean;
      amount: number;
      fromConversion: boolean;
      projected: boolean;
    };

/** What the plan does to a logged lot. */
export type LotFate = { converted: number; convertedAt: MonthIndex | null; remaining: number };

export type PlanResult = { months: PlanMonth[]; events: PlanEvent[]; fates: Record<string, LotFate> };

type SimLot = {
  id: string | null;
  program: MilesProgram;
  origin: MilesProgram;
  earned: number;
  exp: number | null;
  amt: number;
  converted: number;
  convertedAt: number | null;
  projected: boolean;
  fromConversion: boolean;
};

const zeroes = <K extends string>(keys: readonly K[]): Record<K, number> =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/**
 * Month-by-month simulation from `now` to `end`. Each month records what could
 * be redeemed (KrisFlyer miles + card points in whole blocks × ratio), then
 * lots expiring that month drop out. With `plan`, expiring card points are
 * converted in their expiry month first — the whole card balance in blocks,
 * so one fee covers it and the miles get 36 months.
 */
export function simulateMiles(lots: MilesLot[], opts: PlanOptions): PlanResult {
  const sim: SimLot[] = lots.map((l) => ({
    id: l.id,
    program: l.program,
    origin: l.program === "krisflyer" ? (l.convertedFrom ?? "krisflyer") : l.program,
    earned: l.earnedMonth ?? Number.NEGATIVE_INFINITY,
    exp: l.expiryMonth,
    amt: avail(l),
    converted: 0,
    convertedAt: null,
    projected: false,
    fromConversion: l.source === "conversion",
  }));

  if (opts.earnPerMonth) {
    for (let m = opts.now + 1; m <= opts.end; m++) {
      for (const p of PROGRAM_ORDER) {
        const n = Math.round(opts.earnPerMonth[p] ?? 0);
        if (n <= 0) continue;
        const rule = MILES_PROGRAMS[p];
        sim.push({
          id: null,
          program: p,
          origin: p,
          earned: m,
          exp: rule.expiryFor ? rule.expiryFor(m) : null,
          amt: n,
          converted: 0,
          convertedAt: null,
          projected: true,
          fromConversion: false,
        });
      }
    }
  }

  const alive = (l: SimLot, m: number) => l.earned <= m && l.amt > 0 && (l.exp === null || l.exp >= m);
  const months: PlanMonth[] = [];
  const events: PlanEvent[] = [];

  for (let m = opts.now; m <= opts.end; m++) {
    if (opts.plan) {
      for (const p of EXPIRING_CARDS) {
        const rule = MILES_PROGRAMS[p];
        const cardLots = sim
          .filter((l) => l.program === p && alive(l, m))
          .sort((a, b) => (a.exp ?? Infinity) - (b.exp ?? Infinity) || a.earned - b.earned);
        const due = cardLots.filter((l) => l.exp === m).reduce((s, l) => s + l.amt, 0);
        if (due <= 0) continue;
        const balance = cardLots.reduce((s, l) => s + l.amt, 0);
        const points = Math.floor(balance / rule.block) * rule.block;
        if (points > 0) {
          let left = points;
          for (const l of cardLots) {
            if (left <= 0) break;
            const take = Math.min(l.amt, left);
            l.amt -= take;
            left -= take;
            l.converted += take;
            l.convertedAt = m;
          }
          sim.push({
            id: null,
            program: "krisflyer",
            origin: p,
            earned: m,
            exp: m + 36,
            amt: points * rule.ratio,
            converted: 0,
            convertedAt: null,
            projected: false,
            fromConversion: true,
          });
          events.push({ type: "convert", month: m, program: p, points, miles: points * rule.ratio, fee: rule.fee, newExpiry: m + 36, due });
        }
        const atRisk = cardLots.filter((l) => l.exp === m).reduce((s, l) => s + l.amt, 0);
        if (atRisk > 0) {
          const leftover = balance - points;
          events.push({ type: "short", month: m, program: p, atRisk, need: rule.block - leftover, leftover });
        }
      }
    }

    const byProgram = zeroes(PROGRAM_ORDER);
    const cardBalance = zeroes(CARD_PROGRAMS);
    const stranded = zeroes(CARD_PROGRAMS);
    for (const l of sim) {
      if (l.program === "krisflyer" && alive(l, m)) byProgram[l.origin] += l.amt;
    }
    for (const p of CARD_PROGRAMS) {
      const bal = sim.filter((l) => l.program === p && alive(l, m)).reduce((s, l) => s + l.amt, 0);
      const miles = convertibleMiles(p, bal);
      cardBalance[p] = bal;
      stranded[p] = bal - miles / MILES_PROGRAMS[p].ratio;
      byProgram[p] += miles;
    }
    months.push({ month: m, byProgram, cardBalance, stranded, total: PROGRAM_ORDER.reduce((s, p) => s + byProgram[p], 0) });

    for (const l of sim) {
      if (l.exp === m && alive(l, m)) {
        events.push({
          type: "expire",
          month: m,
          program: l.origin,
          isMiles: l.program === "krisflyer",
          amount: l.amt,
          fromConversion: l.fromConversion,
          projected: l.projected,
        });
      }
    }
  }

  const fates: Record<string, LotFate> = {};
  for (const l of sim) {
    if (l.id) fates[l.id] = { converted: l.converted, convertedAt: l.convertedAt, remaining: l.amt };
  }
  return { months, events, fates };
}

// ---------------------------------------------------------------------------
// Balances and simple reads

const aliveAt = (l: MilesLot, m: MonthIndex) =>
  avail(l) > 0 && (l.earnedMonth === null || l.earnedMonth <= m) && (l.expiryMonth === null || l.expiryMonth >= m);

/** Points (or miles) of each programme usable in month `m`. */
export function balancesAt(lots: MilesLot[], m: MonthIndex): Record<MilesProgram, number> {
  const out = zeroes(PROGRAM_ORDER);
  for (const l of lots) if (aliveAt(l, m)) out[l.program] += avail(l);
  return out;
}

export function availableAt(lots: MilesLot[], program: MilesProgram, m: MonthIndex): number {
  return lots.filter((l) => l.program === program && aliveAt(l, m)).reduce((s, l) => s + avail(l), 0);
}

/** Soonest expiry still to come for a programme, with the amount expiring then. */
export function nextExpiry(
  lots: MilesLot[],
  program: MilesProgram,
  now: MonthIndex
): { month: MonthIndex; amount: number } | null {
  const upcoming = lots.filter(
    (l) => l.program === program && avail(l) > 0 && l.expiryMonth !== null && l.expiryMonth >= now
  );
  if (!upcoming.length) return null;
  const month = Math.min(...upcoming.map((l) => l.expiryMonth!));
  return { month, amount: upcoming.filter((l) => l.expiryMonth === month).reduce((s, l) => s + avail(l), 0) };
}

/** Average points earned per month over the last 12 months of logged lots (rounded to 10). */
export function averageMonthlyEarn(lots: MilesLot[], program: MilesProgram, now: MonthIndex): number {
  const sum = lots
    .filter(
      (l) =>
        l.program === program &&
        l.source !== "conversion" &&
        l.earnedMonth !== null &&
        l.earnedMonth >= now - 12 &&
        l.earnedMonth < now
    )
    .reduce((s, l) => s + l.amount, 0);
  return Math.round(sum / 12 / 10) * 10;
}

/** Woman's World lot for an expiry month (the DBS app shows one figure per month). */
export function bucketFor(lots: MilesLot[], expiry: MonthIndex): MilesLot | undefined {
  return lots.find((l) => l.program === "dbs_womans_world" && l.expiryMonth === expiry);
}

/** What updating the UOB balance would do (mirrors miles_set_uob_balance). */
export function uobBalancePreview(
  lots: MilesLot[],
  balance: number,
  now: MonthIndex
): { tracked: number; delta: number; quarterFrom: MonthIndex; expiry: MonthIndex } {
  const tracked = availableAt(lots, "uob", now);
  return { tracked, delta: Math.round(balance) - tracked, quarterFrom: quarterStart(now), expiry: quarterEnd(now) + 24 };
}

// ---------------------------------------------------------------------------
// To-dos, card summaries and chart insights

export type MilesTodo =
  | { kind: "convert"; month: MonthIndex; program: CardProgram; points: number; miles: number; fee: number; due: number; newExpiry: MonthIndex }
  | { kind: "short"; month: MonthIndex; program: CardProgram; need: number; atRisk: number; leftover: number }
  | { kind: "kfExpiry"; month: MonthIndex; amount: number }
  | { kind: "hold"; program: CardProgram; balance: number; blocks: number; leftover: number };

/** Dated actions from the plan: up to two conversions per card, the first shortfall per card, holds, first KrisFlyer expiry. */
export function buildTodos(plan: PlanResult, lots: MilesLot[], now: MonthIndex): MilesTodo[] {
  const out: (MilesTodo & { sort: number; order: number })[] = [];
  const converts: Partial<Record<CardProgram, number>> = {};
  const shorts = new Set<CardProgram>();
  for (const e of plan.events) {
    if (e.type === "convert") {
      converts[e.program] = (converts[e.program] ?? 0) + 1;
      if (converts[e.program]! > 2) continue;
      out.push({ kind: "convert", month: e.month, program: e.program, points: e.points, miles: e.miles, fee: e.fee, due: e.due, newExpiry: e.newExpiry, sort: e.month, order: 0 });
    } else if (e.type === "short" && !shorts.has(e.program)) {
      shorts.add(e.program);
      out.push({ kind: "short", month: e.month, program: e.program, need: e.need, atRisk: e.atRisk, leftover: e.leftover, sort: e.month, order: 1 });
    }
  }
  const balances = balancesAt(lots, now);
  for (const p of CARD_PROGRAMS) {
    if (MILES_PROGRAMS[p].expiryFor || balances[p] <= 0) continue;
    const block = MILES_PROGRAMS[p].block;
    const blocks = Math.floor(balances[p] / block);
    out.push({ kind: "hold", program: p, balance: balances[p], blocks, leftover: balances[p] - blocks * block, sort: Infinity, order: 2 });
  }
  const kf = plan.events.find((e) => e.type === "expire" && e.isMiles && !e.projected);
  if (kf && kf.type === "expire") out.push({ kind: "kfExpiry", month: kf.month, amount: kf.amount, sort: kf.month, order: 3 });
  out.sort((a, b) => a.sort - b.sort || a.order - b.order);
  return out.map((t) => {
    const copy: Partial<typeof t> = { ...t };
    delete copy.sort;
    delete copy.order;
    return copy as MilesTodo;
  });
}

export type CardSummary = {
  program: CardProgram;
  balance: number;
  convertibleMiles: number;
  action:
    | { kind: "convertBy"; month: MonthIndex }
    | { kind: "reachBlock" }
    | { kind: "whenBooking" }
    | { kind: "nothingDue" };
  /** Progress to the next whole block. */
  remainder: number;
  short: number;
  /** When leftover points will expire unless the next block is reached. */
  deadline: { month: MonthIndex; atRisk: number } | null;
};

export function cardSummary(program: CardProgram, plan: PlanResult, lots: MilesLot[], now: MonthIndex): CardSummary {
  const rule = MILES_PROGRAMS[program];
  const balance = balancesAt(lots, now)[program];
  const convert = plan.events.find((e) => e.type === "convert" && e.program === program);
  const short = plan.events.find((e) => e.type === "short" && e.program === program);
  let action: CardSummary["action"];
  if (!rule.expiryFor) action = { kind: "whenBooking" };
  else if (convert && (!short || convert.month <= short.month)) action = { kind: "convertBy", month: convert.month };
  else if (short) action = { kind: "reachBlock" };
  else action = { kind: "nothingDue" };
  const remainder = balance % rule.block;
  return {
    program,
    balance,
    convertibleMiles: convertibleMiles(program, balance),
    action,
    remainder,
    short: rule.block - remainder,
    deadline: short && short.type === "short" ? { month: short.month, atRisk: short.atRisk } : null,
  };
}

export type FlightInsights = {
  peak: number;
  peakFrom: MonthIndex;
  peakTo: MonthIndex;
  firstDrop: MonthIndex | null;
  target: { from: MonthIndex; to: MonthIndex; openEnded: boolean } | null;
  /** Miles short of the target at the peak (when never reached). */
  targetShortBy: number;
  /** Biggest gap between following the plan and never converting. */
  neverConvertGap: { miles: number; month: MonthIndex; lossesFrom: MonthIndex | null } | null;
};

export function flightInsights(plan: PlanResult, base: PlanResult, targetMiles: number): FlightInsights {
  const m = plan.months;
  const totals = m.map((r) => r.total);
  const peak = Math.max(...totals);
  const a = totals.indexOf(peak);
  let b = a;
  while (b + 1 < m.length && totals[b + 1] === peak) b++;
  const dropIdx = totals.findIndex((t, i) => i > 0 && t < totals[i - 1]);

  let target: FlightInsights["target"] = null;
  const first = totals.findIndex((t) => t >= targetMiles);
  if (first >= 0) {
    let last = first;
    while (last + 1 < m.length && totals[last + 1] >= targetMiles) last++;
    target = { from: m[first].month, to: m[last].month, openEnded: last === m.length - 1 };
  }

  let gap = 0;
  let gapIdx = 0;
  m.forEach((r, i) => {
    const d = r.total - base.months[i].total;
    if (d > gap) {
      gap = d;
      gapIdx = i;
    }
  });
  const baseDrop = base.months.findIndex((r, i) => i > 0 && r.total < base.months[i - 1].total);

  return {
    peak,
    peakFrom: m[a].month,
    peakTo: m[b].month,
    firstDrop: dropIdx > 0 ? m[dropIdx].month : null,
    target,
    targetShortBy: target ? 0 : targetMiles - peak,
    neverConvertGap:
      gap > 0 ? { miles: gap, month: m[gapIdx].month, lossesFrom: baseDrop > 0 ? base.months[baseDrop].month : null } : null,
  };
}

/** Plain-language list of what happens in a month (for chart tooltips). */
export function eventsInMonth(plan: PlanResult, month: MonthIndex): string[] {
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  const out: string[] = [];
  for (const e of plan.events) {
    if (e.month !== month) continue;
    const p = MILES_PROGRAMS[e.program];
    if (e.type === "convert") out.push(`Convert ${fmt(e.points)} ${p.short} points → ${fmt(e.miles)} miles`);
    else if (e.type === "expire") {
      if (e.isMiles) out.push(`${fmt(e.amount)} KrisFlyer miles expire${e.fromConversion && e.program !== "krisflyer" ? ` (from ${p.short})` : ""}`);
      else out.push(`${fmt(e.amount)} ${p.short} ${p.unit} expire${e.projected ? " (projected)" : ""}`);
    }
  }
  return out;
}
