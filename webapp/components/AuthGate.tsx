"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { fetchJson } from "@/lib/fetch-json";

type SessionUser = { id: string; email: string | null };

export function AuthGate() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [checkFailed, setCheckFailed] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState("");

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
  }, [checkSession]);

  useEffect(() => {
    if (checking || checkFailed || !configured || user) return;
    const next = encodeURIComponent(
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/"
    );
    console.info("[AuthGate] redirecting to login");
    router.replace(`/login?next=${next}`);
  }, [checking, checkFailed, configured, user, router]);

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
      <p className="loading">Redirecting to sign in…</p>
    </div>
  );
}
