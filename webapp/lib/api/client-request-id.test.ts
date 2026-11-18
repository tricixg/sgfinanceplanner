import { describe, expect, it } from "vitest";
import { deriveClientRequestId, newClientRequestId, SubmitKey } from "@/lib/api/client-request-id";
import { parseClientRequestId } from "@/lib/api/idempotency";

describe("client request ids", () => {
  it("generates keys the server accepts, including derived leg keys", () => {
    const k = newClientRequestId();
    expect(parseClientRequestId(k)).toBe(k);
    expect(parseClientRequestId(deriveClientRequestId(k, "from"))).toBe(`${k}:from`);
    expect(newClientRequestId()).not.toBe(k);
    expect(deriveClientRequestId(undefined, "from")).toBeUndefined();
  });

  it("SubmitKey: same payload → same key (double-click / retry); changed payload → new key; reset → new key", () => {
    const s = new SubmitKey();
    const a = s.keyFor({ amount: 5, note: "coffee" });
    expect(s.keyFor({ amount: 5, note: "coffee" })).toBe(a);
    const b = s.keyFor({ amount: 6, note: "coffee" });
    expect(b).not.toBe(a);
    s.reset();
    expect(s.keyFor({ amount: 6, note: "coffee" })).not.toBe(b);
  });
});
