import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginClient } from "./LoginClient";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in with a magic link (invite-only)",
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="wrap pin-screen">
          <p className="loading">Loading…</p>
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
