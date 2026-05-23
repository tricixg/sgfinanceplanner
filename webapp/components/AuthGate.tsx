"use client";

import { useCallback, useEffect, useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { fetchJson } from "@/lib/fetch-json";
import { createClient } from "@/lib/supabase/client";

type SessionUser = { id: string; email: string | null };

export function AuthGate() {
  const [checking, setChecking] = useState(true);
  const [checkFailed, setCheckFailed] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const checkSession = useCallback(async () => {
    setChecking(true);
    setCheckFailed(false);
    try {
      const { res, data: json } = await fetchJson<{
        configured?: boolean;
        user?: SessionUser | null;
        error?: string;
      }>("/api/auth/session", { credentials: "include" });
      if (!res.ok) {
        throw new Error(json.error ?? `Session check failed (${res.status})`);
      }
      setConfigured(Boolean(json.configured));
      setUser(json.user ?? null);
      console.info("[AuthGate] session check", {
        configured: json.configured,
        signedIn: Boolean(json.user),
      });
    } catch (e) {
      console.error("[AuthGate] session check failed", e);
      setCheckFailed(true);
      setError(
        e instanceof Error
          ? e.message
          : "Could not reach the server. Is `npm run dev` running?"
      );
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkSession();

    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "error") {
      setError("Sign-in link expired or invalid. Request a new magic link.");
      window.history.replaceState({}, "", "/");
    }
  }, [checkSession]);

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (signInError) {
        setError(signInError.message);
        console.warn("[AuthGate] magic link failed", signInError.message);
        return;
      }
      setSent(true);
      console.info("[AuthGate] magic link sent", { email: email.trim() });
    } catch {
      setError("Could not send magic link. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="wrap pin-screen">
        <p className="loading">Checking access…</p>
      </div>
    );
  }

  if (checkFailed) {
    return (
      <div className="wrap pin-screen">
        <div className="pin-card card">
          <div className="kicker">Private dashboard</div>
          <h1 className="pin-title">Cannot reach server</h1>
          <p className="pin-error" role="alert">
            {error}
          </p>
          <p className="note" style={{ marginBottom: 16 }}>
            If you are developing locally, stop any old dev server and run{" "}
            <code>npm run dev</code> from the <code>webapp</code> folder (Node 20+).
          </p>
          <button type="button" className="btn" onClick={() => checkSession()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!configured || user) {
    return <Dashboard userId={user?.id} userEmail={user?.email ?? undefined} />;
  }

  return (
    <div className="wrap pin-screen">
      <div className="pin-card card">
        <div className="kicker">Private dashboard</div>
        <h1 className="pin-title">Sign in</h1>
        {sent ? (
          <>
            <p className="sub" style={{ marginBottom: 12 }}>
              Check your email for a sign-in link to <strong>{email}</strong>.
            </p>
            <p className="note" style={{ marginBottom: 16 }}>
              The link opens this app and keeps you signed in on this device.
            </p>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setSent(false);
                setError("");
                console.info("[AuthGate] resend — reset form");
              }}
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <p className="sub" style={{ marginBottom: 20 }}>
              Enter your email. We&apos;ll send a magic link — no password needed.
            </p>
            <form onSubmit={sendMagicLink}>
              <label className="pin-label">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  required
                />
              </label>
              {error && (
                <p className="pin-error" role="alert">
                  {error}
                </p>
              )}
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
