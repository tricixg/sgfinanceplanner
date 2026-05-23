"use client";

import "@/components/chart-setup";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/app/AppShell";
import { AppSessionProvider } from "@/contexts/AppSessionContext";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      {(user) => (
        <AppSessionProvider user={user}>
          <AppShell>{children}</AppShell>
        </AppSessionProvider>
      )}
    </RequireAuth>
  );
}
