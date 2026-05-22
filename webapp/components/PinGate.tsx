"use client";

import { useCallback, useEffect, useState } from "react";
import { consumeForceLock } from "@/lib/auth/pin-client";
import { Dashboard } from "@/components/Dashboard";

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
      const res = await fetch("/api/auth/pin", { credentials: "include" });
      const json = await res.json();
      setEnabled(Boolean(json.enabled));
      setUnlocked(Boolean(json.ok));
      console.info("[PinGate] session check", json);
    } catch (e) {
      console.error("[PinGate] session check failed", e);
      setEnabled(false);
      setUnlocked(true);
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
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json();
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
