"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/app/AppShell";
import { AppSessionProvider } from "@/contexts/AppSessionContext";
import { AppDataProvider } from "@/contexts/AppDataProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      {(user) => (
        <AppSessionProvider user={user}>
          <AppDataProvider userId={user?.id}>
            <AppShell>{children}</AppShell>
          </AppDataProvider>
        </AppSessionProvider>
      )}
    </RequireAuth>
  );
}
