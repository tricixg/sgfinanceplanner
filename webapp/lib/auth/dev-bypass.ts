/** Local dev only — skip magic-link login (never enabled in production). */
export function isDevAuthBypass(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.AUTH_BYPASS_DEV?.trim() === "true";
}

export function getDevBypassUserId(): string | undefined {
  const id = process.env.DEV_USER_ID?.trim();
  return id || undefined;
}

/** Real auth email for dev bypass (matches received partner invites). */
export function getDevBypassEmail(): string | undefined {
  const email = process.env.DEV_USER_EMAIL?.trim().toLowerCase();
  return email && email.includes("@") ? email : undefined;
}
