"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { appConfig } from "@/lib/config";

export type AuthMode = "login" | "signup";

type Props = {
  /** Path to open after the magic link (passed through /auth/callback). */
  redirectNext?: string;
  initialError?: string;
  defaultMode?: AuthMode;
};

const COPY = {
  login: {
    title: "Sign in",
    lead: "Welcome back. Enter your email and we’ll send a magic link — no password needed.",
    submit: "Send sign-in link",
    sent: "Check your email for a sign-in link to",
  },
  signup: {
    title: "Create account",
    lead: "New here? Enter your email to create your account. We’ll send a magic link — no password needed.",
    submit: "Send sign-up link",
    sent: "Check your email to finish creating your account at",
  },
} as const;

export function MagicLinkAuth({
  redirectNext = "/",
  initialError = "",
  defaultMode = "login",
}: Props) {
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);

  const copy = COPY[mode];

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const supabase = createClient();
      const next = redirectNext.startsWith("/") ? redirectNext : "/";
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });
      if (signInError) {
        setError(signInError.message);
        console.warn("[MagicLinkAuth] magic link failed", {
          mode,
          message: signInError.message,
        });
        return;
      }
      setSent(true);
      console.info("[MagicLinkAuth] magic link sent", {
        mode,
        email: email.trim(),
        redirectNext: next,
      });
    } catch (err) {
      console.error("[MagicLinkAuth] unexpected error", err);
      setError("Could not send magic link. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="wrap pin-screen">
      <div className="pin-card card auth-card">
        <div className="kicker">{appConfig.kicker}</div>
        <h1 className="pin-title">{copy.title}</h1>

        <div className="auth-mode-tabs" role="tablist" aria-label="Sign in or sign up">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "auth-mode-tab on" : "auth-mode-tab"}
            onClick={() => {
              setMode("login");
              setError("");
              setSent(false);
              console.info("[MagicLinkAuth] switched to login");
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={mode === "signup" ? "auth-mode-tab on" : "auth-mode-tab"}
            onClick={() => {
              setMode("signup");
              setError("");
              setSent(false);
              console.info("[MagicLinkAuth] switched to signup");
            }}
          >
            Create account
          </button>
        </div>

        {sent ? (
          <>
            <p className="sub" style={{ marginBottom: 12 }}>
              {copy.sent} <strong>{email}</strong>.
            </p>
            <p className="note" style={{ marginBottom: 16 }}>
              The link opens this app and keeps you signed in on this device. First-time
              sign-up uses the same link — your dashboard is created when you open it.
            </p>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setSent(false);
                setError("");
                console.info("[MagicLinkAuth] reset form");
              }}
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <p className="sub" style={{ marginBottom: 20 }}>
              {copy.lead}
            </p>
            <form onSubmit={sendMagicLink}>
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
              {error ? (
                <p className="pin-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                className="btn"
                disabled={submitting || !email.trim()}
              >
                {submitting ? "Sending…" : copy.submit}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
