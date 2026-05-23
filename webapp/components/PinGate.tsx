"use client";

import { useCallback, useEffect, useState } from "react";
import { consumeForceLock } from "@/lib/auth/pin-client";
import { Dashboard } from "@/components/Dashboard";
import { fetchJson } from "@/lib/fetch-json";

export function PinGate() {
  const [checking, setChecking] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const checkSession = useCallback(async () => {
    setChecking(true);
    if (consumeForceLock()) {
      setEnabled(true);
      setUnlocked(false);
      setChecking(false);
      return;
    }
    try {
      const { data: json } = await fetchJson<{ enabled?: boolean; ok?: boolean }>(
        "/api/auth/pin",
        { credentials: "include" }
      );
      setEnabled(Boolean(json.enabled));
      setUnlocked(Boolean(json.ok));
      console.info("[PinGate] session check", json);
    } catch (e) {
      console.error("[PinGate] session check failed", e);
      setEnabled(false);
      setUnlocked(false);
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
  }, [checkSession]);

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { res, data: json } = await fetchJson<{ error?: string }>(
        "/api/auth/pin",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin }),
        }
      );
      if (!res.ok) {
        setError(json.error ?? "Incorrect PIN");
        setPin("");
        console.warn("[PinGate] unlock failed", json);
        return;
      }
      setUnlocked(true);
      setPin("");
      console.info("[PinGate] unlocked");
    } catch {
      setError("Could not verify PIN. Try again.");
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

  if (error && !unlocked) {
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

  if (!enabled || unlocked) {
    return <Dashboard />;
  }

  return (
    <div className="wrap pin-screen">
      <div className="pin-card card">
        <div className="kicker">Private dashboard</div>
        <h1 className="pin-title">Enter PIN</h1>
        <p className="sub" style={{ marginBottom: 20 }}>
          This app is protected. After unlock, your saved data loads from Supabase.
        </p>
        <form onSubmit={submitPin}>
          <label className="pin-label">
            PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              autoFocus
            />
          </label>
          {error && (
            <p className="pin-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn" disabled={submitting || pin.length < 4}>
            {submitting ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
