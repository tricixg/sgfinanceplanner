"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MagicLinkAuth, type AuthMode } from "@/components/MagicLinkAuth";
import { fetchJson } from "@/lib/fetch-json";
import { appConfig } from "@/lib/config";

type SessionUser = { id: string; email: string | null };

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function authErrorMessage(code: string | null): string {
  switch (code) {
    case "error":
      return "Sign-in link expired or invalid. Request a new magic link.";
    case "unconfigured":
      return "Sign-in is not configured on this deployment.";
    default:
      return "";
  }
}

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = useMemo(
    () => safeNextPath(searchParams.get("next")),
    [searchParams]
  );
  const authCode = searchParams.get("auth");
  const initialError = useMemo(() => authErrorMessage(authCode), [authCode]);
  const defaultMode: AuthMode =
    searchParams.get("mode") === "signup" ? "signup" : "login";

  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(false);

  const checkSession = useCallback(async () => {
    setChecking(true);
    try {
      const { res, data: json } = await fetchJson<{
        configured?: boolean;
        user?: SessionUser | null;
      }>("/api/auth/session", { credentials: "include" });
      if (!res.ok) {
        console.warn("[login] session check HTTP error", res.status);
        setConfigured(false);
        return;
      }
      setConfigured(Boolean(json.configured));
      if (json.user) {
        console.info("[login] already signed in — redirect", { next });
        router.replace(next);
        return;
      }
      console.info("[login] session check", { configured: json.configured });
    } catch (e) {
      console.error("[login] session check failed", e);
      setConfigured(false);
    } finally {
      setChecking(false);
    }
  }, [next, router]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!authCode) return;
    const qs = new URLSearchParams();
    if (next !== "/") qs.set("next", next);
    if (defaultMode === "signup") qs.set("mode", "signup");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    window.history.replaceState({}, "", `/login${suffix}`);
  }, [authCode, next, defaultMode]);

  if (checking) {
    return (
      <div className="wrap pin-screen">
        <p className="loading">Checking session…</p>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="wrap pin-screen">
        <div className="pin-card card auth-card">
          <div className="kicker">{appConfig.kicker}</div>
          <h1 className="pin-title">Sign-in unavailable</h1>
          <p className="sub" style={{ marginBottom: 16 }}>
            Supabase auth is not configured for this environment. You can still use the
            dashboard with browser-only storage.
          </p>
          <Link href="/" className="btn">
            Continue to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <MagicLinkAuth
      redirectNext={next}
      initialError={initialError}
      defaultMode={defaultMode}
    />
  );
}
