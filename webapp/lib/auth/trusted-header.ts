/**
 * Carries the identity middleware already verified via `supabase.auth.getUser()` down to
 * Route Handlers, so they don't need to re-verify the JWT against Supabase Auth on every
 * request.
 *
 * The header value is `<base64url(payload JSON)>.<hex HMAC-SHA256 of that base64url string>`,
 * signed with the server-only `AUTH_HEADER_SECRET`. Middleware is not guaranteed to run for
 * every path that reaches a Route Handler (a matcher can skip it), so the header on its own
 * is attacker-controllable; only a value with a valid signature is trusted. A missing secret,
 * missing signature or wrong signature all mean "not trusted" and the caller must fall back
 * to a live `supabase.auth.getUser()`.
 *
 * Uses Web Crypto only, so it runs in both the middleware/proxy and Node route runtimes.
 * Verification goes through `crypto.subtle.verify`, which compares in constant time.
 */
export const TRUSTED_USER_HEADER = "x-sgfp-verified-user";

export type TrustedUser = {
  id: string;
  email: string | null;
  hasPassword: boolean;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Server-only secret. Undefined when unset/blank — callers must then not trust the header. */
export function getAuthHeaderSecret(): string | undefined {
  const secret = process.env.AUTH_HEADER_SECRET?.trim();
  return secret ? secret : undefined;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const bin = atob(padded);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}

export async function encodeTrustedUser(
  user: {
    id: string;
    email?: string | null;
    user_metadata?: { has_password?: unknown } | null;
  },
  secret: string
): Promise<string> {
  const payload: TrustedUser = {
    id: user.id,
    email: user.email ?? null,
    hasPassword: Boolean(user.user_metadata?.has_password),
  };
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(body));
  return `${body}.${bytesToHex(new Uint8Array(sig))}`;
}

/** Returns the user only if the value carries a valid signature for `secret`. */
export async function decodeTrustedUser(
  headerValue: string | null,
  secret: string | undefined
): Promise<TrustedUser | null> {
  if (!headerValue || !secret) return null;
  const parts = headerValue.split(".");
  if (parts.length !== 2) return null;
  const [body, sigHex] = parts;
  const sig = hexToBytes(sigHex);
  if (!sig || sig.length !== 32) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, "verify"),
    sig as BufferSource,
    encoder.encode(body)
  );
  if (!valid) return null;
  const bytes = base64UrlToBytes(body);
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(decoder.decode(bytes));
    if (typeof parsed?.id !== "string" || !parsed.id) return null;
    return {
      id: parsed.id,
      email: typeof parsed.email === "string" ? parsed.email : null,
      hasPassword: Boolean(parsed.hasPassword),
    };
  } catch {
    return null;
  }
}
