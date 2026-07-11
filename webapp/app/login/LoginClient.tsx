"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MagicLinkAuth } from "@/components/MagicLinkAuth";
import { PasswordAuth } from "@/components/PasswordAuth";
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

type Step =
  | { type: "email" }
  | { type: "magic-link"; email: string }
  | { type: "password"; email: string };

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = useMemo(
    () => safeNextPath(searchParams.get("next")),
    [searchParams]
  );
  const authCode = searchParams.get("auth");
  const initialError = useMemo(() => authErrorMessage(authCode), [authCode]);

  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [step, setStep] = useState<Step>({ type: "email" });
  const [email, setEmail] = useState("");
  const [checking2, setChecking2] = useState(false);
  const [formError, setFormError] = useState(initialError);

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
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    window.history.replaceState({}, "", `/login${suffix}`);
  }, [authCode, next]);

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setFormError("");
    setChecking2(true);
    try {
      const { res, data } = await fetchJson<{
        isKnownUser?: boolean;
        hasPassword?: boolean;
      }>("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) throw new Error("Check failed");
      if (data.hasPassword) {
        setStep({ type: "password", email: trimmed });
      } else {
        setStep({ type: "magic-link", email: trimmed });
      }
    } catch (e) {
      console.error("[login] check-email failed", e);
      setStep({ type: "magic-link", email: trimmed });
    } finally {
      setChecking2(false);
    }
  };

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

  if (step.type === "password") {
    return (
      <PasswordAuth
        email={step.email}
        redirectNext={next}
        onBack={() => setStep({ type: "email" })}
        onSwitchToMagicLink={() =>
          setStep({ type: "magic-link", email: step.email })
        }
      />
    );
  }

  if (step.type === "magic-link") {
    return (
      <MagicLinkAuth
        redirectNext={next}
        initialEmail={step.email}
        onBack={() => setStep({ type: "email" })}
      />
    );
  }

  return (
    <div className="wrap pin-screen">
      <div className="pin-card card auth-card">
        <div className="kicker">{appConfig.kicker}</div>
        <h1 className="pin-title">Continue with email</h1>
        <p className="sub" style={{ marginBottom: 20 }}>
          Enter your email to sign in. If you have set up a password, you can use it
          directly. Otherwise a magic link will be sent.
        </p>
        <form onSubmit={handleEmailContinue}>
          <label className="pin-label auth-label">
            Email
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              required
            />
          </label>
          {formError ? (
            <p className="pin-error" role="alert">
              {formError}
            </p>
          ) : null}
          <button
            type="submit"
            className="btn"
            disabled={checking2 || !email.trim()}
          >
            {checking2 ? "Checking…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
