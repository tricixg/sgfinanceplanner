import { describe, expect, it } from "vitest";
import {
  POKER_IMPORT_EXAMPLE_ROW,
  POKER_IMPORT_HEADERS,
  POKER_IMPORT_MAX_ROWS,
  POKER_IMPORT_TEMPLATE_CSV,
} from "@/lib/poker/import-template";
import { parsePokerCsv, POKER_IMPORT_MAX_AMOUNT, sanitizeCsvCell } from "@/lib/poker/parse-csv";

describe("sanitizeCsvCell", () => {
  it("strips formula injection prefixes", () => {
    expect(sanitizeCsvCell("=1+1")).toBe("1+1");
    expect(sanitizeCsvCell("+cmd")).toBe("cmd");
    expect(sanitizeCsvCell("@SUM(A1)")).toBe("SUM(A1)");
  });
});

describe("parsePokerCsv", () => {
  it("parses the official template", () => {
    const { rows, errors } = parsePokerCsv(POKER_IMPORT_TEMPLATE_CSV);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      sessionType: "cash_game",
      buyIn: 300,
      cashOut: 450,
      currency: "SGD",
      gameName: "NLH",
      smallBlind: 1,
      bigBlind: 3,
      location: "Marina Bay Sands",
    });
    expect(rows[1]).toMatchObject({
      sessionType: "tournament",
      buyIn: 500,
      tournamentName: "APT",
      eventName: "Main Event",
      tournamentResult: "placed",
      amountWon: 1200,
      rebuyAmount: 200,
      bountyAmount: 0,
      currency: "USD",
      fxRateManual: true,
      fxRateToSgd: 1.35,
    });
    expect(rows[2]).toMatchObject({
      sessionType: "tournament",
      buyIn: 300,
      tournamentResult: "busted",
      rebuyAmount: 100,
      bountyAmount: 150,
      amountWon: 0,
      cashOut: 150,
    });
  });

  it("parses tournament placed row", () => {
    const csv = [
      POKER_IMPORT_HEADERS.join(","),
      "tournament,2026-05-10T14:00,RWS,500,,USD,1.35,true,8,Day 1,,,,,APT,Main Event,placed,1200,100,25,8,200,",
    ].join("\n");
    const { rows, errors } = parsePokerCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      sessionType: "tournament",
      buyIn: 500,
      tournamentName: "APT",
      eventName: "Main Event",
      tournamentResult: "placed",
      amountWon: 1200,
      rebuyAmount: 100,
      bountyAmount: 25,
      cashOut: 1225,
      tournamentPlace: 8,
      tournamentEntries: 200,
      fxRateManual: true,
      fxRateToSgd: 1.35,
    });
  });

  it("rejects missing required headers", () => {
    const { errors } = parsePokerCsv("BuyIn,CashOut\n100,150");
    expect(errors.some((e) => e.message.includes("SessionType"))).toBe(true);
  });

  it("rejects invalid session type", () => {
    const csv = [
      POKER_IMPORT_HEADERS.join(","),
      "sit_and_go,2026-01-01,Home,100,150,SGD,,false,,,,1,3,,,,,,,,,,",
    ].join("\n");
    const { errors } = parsePokerCsv(csv);
    expect(errors.some((e) => e.message.includes("SessionType"))).toBe(true);
  });

  it("rejects cash game without stakes", () => {
    const csv = [
      POKER_IMPORT_HEADERS.join(","),
      "cash_game,2026-01-01,Home,100,150,SGD,,false,,,,,,,,,,,,,,",
    ].join("\n");
    const { errors } = parsePokerCsv(csv);
    expect(errors.some((e) => e.message.includes("SmallBlind"))).toBe(true);
  });

  it("enforces row cap", () => {
    const dataRows = Array.from({ length: POKER_IMPORT_MAX_ROWS + 1 }, () =>
      POKER_IMPORT_EXAMPLE_ROW
    );
    const csv = [POKER_IMPORT_HEADERS.join(","), ...dataRows].join("\n");
    const { errors } = parsePokerCsv(csv);
    expect(errors.some((e) => e.message.includes("Too many rows"))).toBe(true);
  });

  it("rejects CashOut on tournament rows", () => {
    const csv = [
      POKER_IMPORT_HEADERS.join(","),
      "tournament,2026-05-10T14:00,RWS,500,100,USD,1.35,true,8,Day 1,,,,,APT,Main Event,placed,1200,0,0,8,200,",
    ].join("\n");
    const { errors } = parsePokerCsv(csv);
    expect(errors.some((e) => e.message.includes("CashOut is for cash games only"))).toBe(true);
  });

  it("parses large VND tournament amounts", () => {
    const csv = [
      POKER_IMPORT_HEADERS.join(","),
      "tournament,2026-05-10T14:00,RWS,5000000,,VND,,false,8,Day 1,,,,,APT,Main Event,placed,17800000,0,0,1,200,",
    ].join("\n");
    const { rows, errors } = parsePokerCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0]?.amountWon).toBe(17_800_000);
    expect(rows[0]?.buyIn).toBe(5_000_000);
  });

  it("reports when amount exceeds import maximum", () => {
    const csv = [
      POKER_IMPORT_HEADERS.join(","),
      `tournament,2026-05-10T14:00,RWS,100,,SGD,,false,,,,,,,APT,Main Event,placed,${POKER_IMPORT_MAX_AMOUNT + 1},0,0,,,`,
    ].join("\n");
    const { errors } = parsePokerCsv(csv);
    expect(errors.some((e) => e.message.includes("AmountWon exceeds maximum"))).toBe(true);
  });
});
