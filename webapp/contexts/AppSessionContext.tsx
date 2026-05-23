"use client";

import { createContext, useContext } from "react";
import type { SessionUser } from "@/components/RequireAuth";

const AppSessionContext = createContext<SessionUser | null>(null);

export function AppSessionProvider({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  return (
    <AppSessionContext.Provider value={user}>{children}</AppSessionContext.Provider>
  );
}

export function useAppSession() {
  return useContext(AppSessionContext);
}
