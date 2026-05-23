"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetch-json";

export type SessionUser = { id: string; email: string | null };

const devBypass = process.env.NEXT_PUBLIC_AUTH_BYPASS_DEV === "true";

type Props = {
  children: React.ReactNode | ((user: SessionUser | null) => React.ReactNode);
};

export function RequireAuth({ children }: Props) {
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
      console.info("[RequireAuth] session check", {
        configured: json.configured,
        signedIn: Boolean(json.user),
      });
    } catch (e) {
      console.error("[RequireAuth] session check failed", e);
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
    if (devBypass) return;
    const next = encodeURIComponent(
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/"
    );
    console.info("[RequireAuth] redirecting to login");
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

  if (devBypass || !configured || user) {
    const content = typeof children === "function" ? children(user) : children;
    return <>{content}</>;
  }

  return (
    <div className="wrap pin-screen">
      <p className="loading">Redirecting to sign in…</p>
    </div>
  );
}
