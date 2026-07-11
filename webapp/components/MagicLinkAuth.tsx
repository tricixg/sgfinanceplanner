"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { appConfig } from "@/lib/config";

type Props = {
  redirectNext?: string;
  initialError?: string;
  /** Pre-filled email — also triggers auto-send. */
  initialEmail?: string;
  onBack?: () => void;
};

export function MagicLinkAuth({
  redirectNext = "/",
  initialError = "",
  initialEmail = "",
  onBack,
}: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);
  const autoSentRef = useRef(false);

  const sendMagicLink = async (targetEmail: string) => {
    setError("");
    setSubmitting(true);
    try {
      const supabase = createClient();
      const next = redirectNext.startsWith("/") ? redirectNext : "/";
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: targetEmail.trim(),
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (signInError) {
        setError(signInError.message);
        console.warn("[MagicLinkAuth] magic link failed", signInError.message);
        return;
      }
      setSent(true);
      console.info("[MagicLinkAuth] magic link sent", { email: targetEmail, redirectNext: next });
    } catch (err) {
      console.error("[MagicLinkAuth] unexpected error", err);
      setError("Could not send magic link. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-send when email is pre-filled from the email-first flow
  useEffect(() => {
    if (initialEmail && !autoSentRef.current) {
      autoSentRef.current = true;
      void sendMagicLink(initialEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMagicLink(email);
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
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setSent(false);
                  autoSentRef.current = false;
                  setError("");
                }}
              >
                Use a different email
              </button>
              {onBack ? (
                <button type="button" className="btn ghost" onClick={onBack}>
                  Back
                </button>
              ) : null}
            </div>
          </>
        ) : submitting && initialEmail ? (
          <p className="sub">Sending magic link to <strong>{email}</strong>…</p>
        ) : (
          <>
            <p className="sub" style={{ marginBottom: 20 }}>
              Enter your email and we will send a magic link. No password needed. If you
              do not have an account yet, one will be created when you open the link.
            </p>
            <form onSubmit={handleSubmit}>
              <label className="pin-label auth-label">
                Email
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus={!initialEmail}
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
            {onBack ? (
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn ghost sm" onClick={onBack}>
                  Use different email
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
