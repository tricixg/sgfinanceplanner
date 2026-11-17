import { describe, expect, it } from "vitest";
import { canReplaceLocalState } from "@/lib/me/local-data-actions";

describe("canReplaceLocalState", () => {
  it("is never allowed for a signed-in user", () => {
    expect(canReplaceLocalState(true)).toBe(false);
  });
  it("is allowed in browser-only mode", () => {
    expect(canReplaceLocalState(false)).toBe(true);
  });
});
