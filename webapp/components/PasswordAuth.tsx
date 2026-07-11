"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { appConfig } from "@/lib/config";

type Props = {
  email: string;
  redirectNext?: string;
  onBack: () => void;
  onSwitchToMagicLink: () => void;
};

export function PasswordAuth({
  email,
  redirectNext = "/",
  onBack,
  onSwitchToMagicLink,
}: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError("Incorrect password. Try again or use a magic link.");
        console.warn("[PasswordAuth] sign in failed", signInError.message);
        return;
      }
      console.info("[PasswordAuth] signed in with password");
      window.location.href = redirectNext.startsWith("/") ? redirectNext : "/";
    } catch (err) {
      console.error("[PasswordAuth] unexpected error", err);
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="wrap pin-screen">
      <div className="pin-card card auth-card">
        <div className="kicker">{appConfig.kicker}</div>
        <h1 className="pin-title">Sign in with password</h1>
        <p className="sub" style={{ marginBottom: 20 }}>
          Signing in as <strong>{email}</strong>.
        </p>
        <form onSubmit={signIn}>
          <label className="pin-label auth-label">
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
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
            disabled={submitting || !password}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn ghost sm" onClick={onSwitchToMagicLink}>
            Use magic link instead
          </button>
          <button type="button" className="btn ghost sm" onClick={onBack}>
            Use different email
          </button>
        </div>
      </div>
    </div>
  );
}
