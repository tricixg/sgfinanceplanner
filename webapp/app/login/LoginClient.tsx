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

  const handleEmailContinue = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setFormError("");
    // Land on magic-link by default — it's the only path that works for a brand-new
    // email (password is opt-in, set from Me/Settings after first sign-in). Whether
    // this email has an account or a password is never checked ahead of time: doing
    // so would mean an unauthenticated endpoint that answers that question for any
    // email, which is an account-enumeration vector.
    setStep({ type: "magic-link", email: trimmed });
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
        onSwitchToPassword={() =>
          setStep({ type: "password", email: step.email })
        }
      />
    );
  }

  return (
    <div className="wrap pin-screen">
      <div className="pin-card card auth-card">
        <div className="kicker">{appConfig.kicker}</div>
        <h1 className="pin-title">Continue with email</h1>
        <p className="sub" style={{ marginBottom: 20 }}>
          Enter your email to sign in with a magic link, or switch to a password on
          the next screen if you have one set up.
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
          <button type="submit" className="btn" disabled={!email.trim()}>
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
