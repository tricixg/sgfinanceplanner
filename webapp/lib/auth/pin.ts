import type { NextRequest } from "next/server";

export const PIN_COOKIE = "sgfp_unlock";
/** 30 days */
export const PIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function isPinProtectionEnabled(): boolean {
  const pin = process.env.DASHBOARD_PIN?.trim();
  return Boolean(pin && pin.length >= 4);
}

function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.DASHBOARD_PIN?.trim() ||
    "dev-insecure-change-me"
  );
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function verifyPin(input: string): boolean {
  const expected = process.env.DASHBOARD_PIN?.trim() ?? "";
  if (!expected || input.length < 4) return false;
  return timingSafeEqualStr(input, expected);
}

export async function createSessionToken(): Promise<string> {
  return hmacSha256Hex("unlocked", sessionSecret());
}

export async function verifySessionToken(
  token: string | undefined
): Promise<boolean> {
  if (!token) return false;
  const expected = await createSessionToken();
  return timingSafeEqualStr(token, expected);
}

export async function isUnlockedRequest(
  req: NextRequest | Request
): Promise<boolean> {
  if (!isPinProtectionEnabled()) return true;
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${PIN_COOKIE}=([^;]+)`));
  const raw = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return verifySessionToken(raw);
}

export function pinCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: PIN_COOKIE_MAX_AGE,
  };
}
