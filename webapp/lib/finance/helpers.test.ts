import { describe, expect, it } from "vitest";
import { fmtSigned2 } from "@/lib/finance/helpers";

describe("fmtSigned2", () => {
  it("prefixes sign before dollar for positive amounts", () => {
    expect(fmtSigned2(100)).toBe("+$100.00");
  });

  it("prefixes sign before dollar for negative amounts", () => {
    expect(fmtSigned2(-94.9)).toBe("-$94.90");
  });

  it("formats zero without sign", () => {
    expect(fmtSigned2(0)).toBe("$0.00");
  });
});
