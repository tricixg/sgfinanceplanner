"use client";

import { Dashboard } from "@/components/Dashboard";
import { RequireAuth } from "@/components/RequireAuth";

export function AuthGate() {
  return (
    <RequireAuth>
      {(user) => (
        <Dashboard userId={user?.id} userEmail={user?.email ?? undefined} />
      )}
    </RequireAuth>
  );
}
