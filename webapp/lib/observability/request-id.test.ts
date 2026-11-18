import { describe, expect, it } from "vitest";
import { assignRequestId, isValidRequestId, requestIdFromHeaders } from "@/lib/observability/request-id";

const VERCEL = "hnd1::iad1::abcde-1700000000000-0123456789ab";
const h = (o: Record<string, string>) => new Headers(o);

describe("request id", () => {
  it("accepts Vercel's format and rejects anything that could pollute logs", () => {
    expect(isValidRequestId(VERCEL)).toBe(true);
    expect(isValidRequestId("req_0123456789abcdef0123")).toBe(true);
    for (const bad of ["", "short", "has space in it", "line\nbreak-12345", "x".repeat(200), "<script>alert(1)</script>", 42, null])
      expect(isValidRequestId(bad)).toBe(false);
  });

  it("reuses x-vercel-id when present, otherwise generates a fresh one each time", () => {
    expect(assignRequestId(h({ "x-vercel-id": VERCEL }))).toBe(VERCEL);
    const a = assignRequestId(h({}));
    const b = assignRequestId(h({}));
    expect(a).toMatch(/^req_[a-z0-9]{20}$/);
    expect(a).not.toBe(b);
  });

  it("a route reads the proxy's stamp, ignoring unusable values", () => {
    expect(requestIdFromHeaders(h({ "x-request-id": VERCEL }))).toBe(VERCEL);
    expect(requestIdFromHeaders(h({ "x-request-id": "bad value" }))).toMatch(/^req_/);
    expect(requestIdFromHeaders(undefined)).toMatch(/^req_/);
  });
});
