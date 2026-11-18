import { fetchJson } from "@/lib/fetch-json";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export type ClientSessionUser = { id: string; email: string | null; hasPassword?: boolean };

function decodeBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/**
 * The signed-in user as recorded in the Supabase session cookie (`sb-<project>-auth-token`,
 * possibly split into `.0`, `.1`, ... chunks, value `base64-<base64url JSON>` or plain JSON).
 * Returns null for anything unfamiliar. Pure; takes `document.cookie`.
 *
 * Deliberately NOT the Supabase browser client: that pulls all of supabase-js (~60 KB gzipped)
 * into the first load of every page just to read a cookie.
 */
export function readSessionUserFromCookies(cookieHeader: string): ClientSessionUser | null {
  const cookies = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!/^sb-.+-auth-token(\.\d+)?$/.test(name)) continue;
    try {
      cookies.set(name, decodeURIComponent(part.slice(i + 1).trim()));
    } catch {
      return null;
    }
  }
  const base = [...cookies.keys()].find((n) => !/\.\d+$/.test(n));
  let raw: string | undefined;
  if (base) {
    raw = cookies.get(base);
  } else {
    // Chunked: <name>.0, <name>.1, ...
    const first = [...cookies.keys()].find((n) => n.endsWith(".0"));
    if (!first) return null;
    const stem = first.slice(0, -2);
    const chunks: string[] = [];
    for (let i = 0; cookies.has(`${stem}.${i}`); i++) chunks.push(cookies.get(`${stem}.${i}`)!);
    raw = chunks.join("");
  }
  if (!raw) return null;
  try {
    const json = raw.startsWith("base64-") ? decodeBase64Url(raw.slice(7)) : raw;
    const user = (JSON.parse(json) as { user?: Record<string, unknown> } | null)?.user;
    if (!user || typeof user.id !== "string" || !user.id) return null;
    const meta = user.user_metadata as { has_password?: unknown } | undefined;
    return {
      id: user.id,
      email: typeof user.email === "string" ? user.email : null,
      hasPassword: Boolean(meta?.has_password),
    };
  } catch {
    return null;
  }
}

/**
 * Who the browser is signed in as, for UI gating only: choosing between "show the app" and "go to
 * /login", and enabling data fetches. NOT a security check — every API route verifies the session
 * itself, so a stale or forged cookie here only makes the first API call answer 401, which sends the
 * user to /login (lib/auth/unauthorized.ts). The proxy has already redirected signed-out page
 * requests before this runs.
 *
 * Fast path: the session cookie, no network. If it is missing or in a format we don't recognise, ask
 * the server (which verifies) rather than guess, so an unfamiliar cookie can never strand a signed-in
 * user in a login redirect loop.
 */
export async function readClientSession(): Promise<{
  configured: boolean;
  user: ClientSessionUser | null;
}> {
  if (!isSupabaseAuthConfigured()) return { configured: false, user: null };
  const local = readSessionUserFromCookies(document.cookie);
  if (local) return { configured: true, user: local };
  const { res, data } = await fetchJson<{
    configured?: boolean;
    user?: ClientSessionUser | null;
    error?: string;
  }>("/api/auth/session", { credentials: "include" });
  if (!res.ok) throw new Error(data.error ?? `Session check failed (${res.status})`);
  return { configured: Boolean(data.configured), user: data.user ?? null };
}
