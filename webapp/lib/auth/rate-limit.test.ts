import { afterEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimitsForTests } from "@/lib/auth/rate-limit";

afterEach(() => {
  resetRateLimitsForTests();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    expect(checkRateLimit("user-a", opts).allowed).toBe(true);
    expect(checkRateLimit("user-a", opts).allowed).toBe(true);
    expect(checkRateLimit("user-a", opts).allowed).toBe(true);
  });

  it("denies when limit exceeded and returns retryAfterSec", () => {
    const opts = { limit: 2, windowMs: 60_000 };
    expect(checkRateLimit("user-b", opts).allowed).toBe(true);
    expect(checkRateLimit("user-b", opts).allowed).toBe(true);
    const denied = checkRateLimit("user-b", opts);
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("tracks keys independently", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimit("user-c", opts).allowed).toBe(true);
    expect(checkRateLimit("user-c", opts).allowed).toBe(false);
    expect(checkRateLimit("user-d", opts).allowed).toBe(true);
  });
});
