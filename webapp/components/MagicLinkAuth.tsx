"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { appConfig } from "@/lib/config";

type Props = {
  /** Path to open after the magic link (passed through /auth/callback). */
  redirectNext?: string;
  initialError?: string;
};

export function MagicLinkAuth({
  redirectNext = "/",
  initialError = "",
}: Props) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);

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
          message: signInError.message,
        });
        return;
      }
      setSent(true);
      console.info("[MagicLinkAuth] magic link sent", {
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
        <h1 className="pin-title">Continue with email</h1>

        {sent ? (
          <>
            <p className="sub" style={{ marginBottom: 12 }}>
              Check your email for a magic link to <strong>{email}</strong>.
            </p>
            <p className="note" style={{ marginBottom: 16 }}>
              Open the link on this device to sign in. If you are new, your account and
              dashboard are created automatically — no separate sign-up step.
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
              Enter your email and we will send a magic link. No password needed. If you
              do not have an account yet, one will be created when you open the link.
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
                {submitting ? "Sending…" : "Send magic link"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
