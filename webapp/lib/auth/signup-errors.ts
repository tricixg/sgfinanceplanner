/**
 * Supabase rejects `signInWithOtp({ shouldCreateUser: false })` for an email that has no
 * account with `otp_disabled` / "Signups not allowed for otp" (HTTP 422). The same error is
 * returned when sign-ups are switched off in the Supabase dashboard.
 */
export const SIGNUP_DISABLED_MESSAGE =
  "No account found for that email. Sign-up is invite-only — check the address, or ask the household owner to add you.";

export function isSignupDisabledError(
  err: { message?: string; code?: string } | null | undefined
): boolean {
  if (!err) return false;
  if (err.code === "otp_disabled" || err.code === "signup_disabled") return true;
  return /signups? not allowed/i.test(err.message ?? "");
}
