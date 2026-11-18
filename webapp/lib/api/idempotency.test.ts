import { describe, expect, it } from "vitest";
import { INVALID_CLIENT_REQUEST_ID, parseClientRequestId } from "@/lib/api/idempotency";
import { isPublicMessage } from "@/lib/api/public-messages";

describe("parseClientRequestId", () => {
  it("treats a missing key as no key", () => {
    expect(parseClientRequestId(undefined)).toBeNull();
    expect(parseClientRequestId(null)).toBeNull();
    expect(parseClientRequestId("")).toBeNull();
  });
  it("accepts UUIDs and similar tokens", () => {
    expect(parseClientRequestId("3f1c2b8e-9d4a-4c1e-8f2a-1b2c3d4e5f60")).toBe(
      "3f1c2b8e-9d4a-4c1e-8f2a-1b2c3d4e5f60"
    );
  });
  it("rejects malformed keys with a public message", () => {
    for (const bad of [123, "short", "has space in it", "x".repeat(101), { a: 1 }]) {
      expect(parseClientRequestId(bad)).toEqual({ error: INVALID_CLIENT_REQUEST_ID });
    }
    expect(isPublicMessage(INVALID_CLIENT_REQUEST_ID)).toBe(true);
  });
});
