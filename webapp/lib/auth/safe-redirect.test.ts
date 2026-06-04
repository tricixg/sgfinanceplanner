import { describe, expect, it } from "vitest";
import { safeRelativeRedirectPath } from "@/lib/auth/safe-redirect";

describe("safeRelativeRedirectPath", () => {
  it("allows normal paths", () => {
    expect(safeRelativeRedirectPath("/")).toBe("/");
    expect(safeRelativeRedirectPath("/me")).toBe("/me");
    expect(safeRelativeRedirectPath("/expenses?ym=2026-05")).toBe("/expenses?ym=2026-05");
  });

  it("blocks open redirects", () => {
    expect(safeRelativeRedirectPath("//evil.com")).toBe("/");
    expect(safeRelativeRedirectPath("https://evil.com")).toBe("/");
    expect(safeRelativeRedirectPath("/\\evil")).toBe("/");
  });

  it("defaults empty or null to home", () => {
    expect(safeRelativeRedirectPath(null)).toBe("/");
    expect(safeRelativeRedirectPath("")).toBe("/");
    expect(safeRelativeRedirectPath("   ")).toBe("/");
  });
});
