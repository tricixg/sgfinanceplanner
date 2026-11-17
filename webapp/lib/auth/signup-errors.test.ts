import { describe, expect, it } from "vitest";
import { isSignupDisabledError } from "@/lib/auth/signup-errors";

describe("isSignupDisabledError (SEC-004)", () => {
  it("recognises Supabase's unknown-email responses", () => {
    expect(isSignupDisabledError({ code: "otp_disabled", message: "x" })).toBe(true);
    expect(isSignupDisabledError({ code: "signup_disabled" })).toBe(true);
    expect(isSignupDisabledError({ message: "Signups not allowed for otp" })).toBe(true);
    expect(isSignupDisabledError({ message: "Signups not allowed for this instance" })).toBe(true);
  });
  it("ignores other errors", () => {
    expect(isSignupDisabledError({ message: "Email rate limit exceeded", code: "over_email_send_rate_limit" })).toBe(false);
    expect(isSignupDisabledError(null)).toBe(false);
  });
});
