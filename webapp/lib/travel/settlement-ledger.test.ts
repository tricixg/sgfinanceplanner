import { describe, expect, it } from "vitest";
import {
  settlementDepositOccurredAt,
  travelReimbursementDepositNote,
} from "@/lib/travel/settlement-ledger";

describe("travelReimbursementDepositNote", () => {
  it("formats lump reimbursement note with trip name", () => {
    expect(travelReimbursementDepositNote("Japan 2026")).toBe(
      "lump reimbursement: Japan 2026"
    );
  });

  it("trims trip name", () => {
    expect(travelReimbursementDepositNote("  Bali  ")).toBe("lump reimbursement: Bali");
  });
});

describe("settlementDepositOccurredAt", () => {
  const now = new Date("2026-06-11T06:30:00.000Z"); // 14:30 SGT on 2026-06-11

  it("uses current SGT time when settlement date is today", () => {
    expect(settlementDepositOccurredAt("2026-06-11", now)).toBe(
      "2026-06-11T14:30:00+08:00"
    );
  });

  it("uses noon SGT on past settlement dates", () => {
    expect(settlementDepositOccurredAt("2026-06-10", now)).toBe(
      "2026-06-10T12:00:00+08:00"
    );
  });
});
