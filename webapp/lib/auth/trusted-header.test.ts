import { describe, expect, it } from "vitest";
import {
  decodeTrustedUser,
  encodeTrustedUser,
  getAuthHeaderSecret,
} from "@/lib/auth/trusted-header";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const user = { id: "11111111-1111-1111-1111-111111111111", email: "a@example.com" };

describe("trusted identity header (SEC-003)", () => {
  it("round-trips a validly signed header", async () => {
    const header = await encodeTrustedUser(
      { ...user, user_metadata: { has_password: true } },
      SECRET
    );
    expect(await decodeTrustedUser(header, SECRET)).toEqual({
      id: user.id,
      email: user.email,
      hasPassword: true,
    });
  });

  it("handles non-ASCII emails", async () => {
    const header = await encodeTrustedUser({ id: "x", email: "ünï@example.com" }, SECRET);
    expect((await decodeTrustedUser(header, SECRET))?.email).toBe("ünï@example.com");
  });

  it("rejects the old unsigned JSON format (forged header)", async () => {
    expect(await decodeTrustedUser(JSON.stringify({ id: user.id }), SECRET)).toBeNull();
  });

  it("rejects a payload with no signature or an empty one", async () => {
    const header = await encodeTrustedUser(user, SECRET);
    const body = header.split(".")[0];
    expect(await decodeTrustedUser(body, SECRET)).toBeNull();
    expect(await decodeTrustedUser(`${body}.`, SECRET)).toBeNull();
  });

  it("rejects a wrong signature", async () => {
    const header = await encodeTrustedUser(user, SECRET);
    const [body, sig] = header.split(".");
    const flipped = (sig[0] === "0" ? "1" : "0") + sig.slice(1);
    expect(await decodeTrustedUser(`${body}.${flipped}`, SECRET)).toBeNull();
    expect(await decodeTrustedUser(`${body}.${"0".repeat(64)}`, SECRET)).toBeNull();
  });

  it("rejects a header signed with a different secret", async () => {
    const header = await encodeTrustedUser(user, "another-secret");
    expect(await decodeTrustedUser(header, SECRET)).toBeNull();
  });

  it("rejects a tampered payload that reuses a valid signature", async () => {
    const mine = await encodeTrustedUser(user, SECRET);
    const victim = await encodeTrustedUser({ id: "victim" }, SECRET);
    const forged = `${victim.split(".")[0]}.${mine.split(".")[1]}`;
    expect(await decodeTrustedUser(forged, SECRET)).toBeNull();
  });

  it("never trusts anything when the secret is missing", async () => {
    const header = await encodeTrustedUser(user, SECRET);
    expect(await decodeTrustedUser(header, undefined)).toBeNull();
    expect(await decodeTrustedUser(null, SECRET)).toBeNull();
  });

  it("treats a blank AUTH_HEADER_SECRET as unset", () => {
    const prev = process.env.AUTH_HEADER_SECRET;
    process.env.AUTH_HEADER_SECRET = "   ";
    expect(getAuthHeaderSecret()).toBeUndefined();
    if (prev === undefined) delete process.env.AUTH_HEADER_SECRET;
    else process.env.AUTH_HEADER_SECRET = prev;
  });
});
