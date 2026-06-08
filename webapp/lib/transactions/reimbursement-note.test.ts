import { describe, expect, it } from "vitest";
import { formatReimbursementNote } from "@/lib/transactions/reimbursement-note";

describe("formatReimbursementNote", () => {
  it("uses last 4 id chars, amount, note, and SGT datetime", () => {
    const note = formatReimbursementNote({
      id: "aa0c8e2b-88bc-46c1-bbeb-844d5729b195",
      amount: 42.5,
      note: "Taxi",
      whenIso: "2025-06-01T20:00:00+08:00",
    });
    expect(note).toContain("b195");
    expect(note).toContain("$42.50");
    expect(note).toContain("Taxi");
    expect(note).toMatch(/Reimb · b195 · \$42\.50 · Taxi · /);
    expect(note).not.toContain("844d5729");
  });

  it("shows em dash when source note is empty", () => {
    const note = formatReimbursementNote({
      id: "abcd-1234-5678-90ef",
      amount: 10,
      note: "",
      whenIso: "2025-05-15T14:30:00+08:00",
    });
    expect(note).toContain(" · — · ");
  });
});
