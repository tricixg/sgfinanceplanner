import { describe, expect, it } from "vitest";
import { verifyCronSecret } from "./cron-auth";

const req = (auth?: string) =>
  new Request("http://x/api/cron/month-end", { headers: auth ? { authorization: auth } : {} });

describe("verifyCronSecret", () => {
  it("fails closed when no secret is configured, even with a header", () => {
    expect(verifyCronSecret(req("Bearer anything"), undefined)).toBe("unconfigured");
    expect(verifyCronSecret(req("Bearer "), "  ")).toBe("unconfigured");
  });
  it("accepts the exact bearer secret", () => {
    expect(verifyCronSecret(req("Bearer s3cret"), "s3cret")).toBe("ok");
  });
  it.each([undefined, "s3cret", "Bearer wrong", "Bearer s3cre", "Bearer s3crets", "Basic s3cret"])(
    "rejects %s",
    (h) => {
      expect(verifyCronSecret(req(h), "s3cret")).toBe("unauthorized");
    }
  );
});
